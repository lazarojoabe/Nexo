"""Extract a review-only draft from local ENEM proof and answer-key files.

This script never downloads material and never writes to the application
database. It deliberately keeps the proof parser and answer-key parser
separate: text and alternatives come only from the proof; correct labels come
only from the official answer-key file. Any ambiguity is emitted as duplicate
data for the API's exception queue instead of being guessed away.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
from pathlib import Path
from typing import Any

import pymupdf as fitz


QUESTION_RE = re.compile(r"(?:^|\n)\s*QUEST(?:A|Ã|Á)O\s+(\d{1,3})\s*", re.IGNORECASE)
OPTION_RE = re.compile(r"^\s*\(?([A-E])\)?\s*[.)\-:]?\s+(.*\S)\s*$", re.IGNORECASE)
COLORS = {"AZUL": "azul", "AMARELO": "amarelo", "BRANCO": "branco", "ROSA": "rosa", "CINZA": "cinza", "LARANJA": "laranja", "VERDE": "verde"}


def normalize(value: str) -> str:
    value = value.replace("\u00a0", " ")
    value = re.sub(r"[ \t]+", " ", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()


def pages_text(path: Path) -> tuple[list[str], int, list[str]]:
    """Read embedded text. For an image answer key, use optional local OCR.

    OCR is intentionally a suggestion only: the API marks its confidence low
    and refuses to make an answer key from incomplete/ambiguous observations.
    """
    document = fitz.open(path)
    try:
        pages = [page.get_text("text", sort=True) for page in document]
    finally:
        document.close()
    warnings: list[str] = []
    if any(text.strip() for text in pages):
        return pages, len(pages), warnings
    try:
        import pytesseract  # type: ignore[import-not-found]
        from PIL import Image  # type: ignore[import-not-found]
        # The API process inherits TESSERACT_CMD from apps/api/.env. On
        # Windows, also support the standard UB-Mannheim installation so a
        # service restart is not required merely to refresh PATH.
        configured = os.environ.get("TESSERACT_CMD")
        default_windows = Path(r"C:\Program Files\Tesseract-OCR\tesseract.exe")
        if configured:
            pytesseract.pytesseract.tesseract_cmd = configured
        elif default_windows.exists():
            pytesseract.pytesseract.tesseract_cmd = str(default_windows)
        available_languages = set(pytesseract.get_languages(config=""))
        requested_language = os.environ.get("TESSERACT_LANGUAGE", "por")
        language = requested_language if requested_language in available_languages else "eng" if "eng" in available_languages else next(iter(available_languages), "")
        if not language:
            raise RuntimeError("Nenhum idioma do Tesseract está instalado.")
        if language != requested_language:
            warnings.append(f"Idioma OCR {requested_language!r} indisponível; usada a base {language!r} apenas como sugestão.")
        text = pytesseract.image_to_string(Image.open(path), lang=language, config="--psm 6")
        warnings.append("Gabarito por imagem lido por OCR local; confira cada alternativa.")
        return [text], 1, warnings
    except Exception:
        warnings.append("O gabarito por imagem não possui texto incorporado e o OCR local não está disponível.")
        return [""], 1, warnings


def parse_options(block: str) -> tuple[str, list[dict[str, str]]]:
    lines = [normalize(line) for line in block.splitlines()]
    labelled = [(index, match) for index, line in enumerate(lines) if (match := OPTION_RE.match(line))]
    sequences = [offset for offset in range(max(0, len(labelled) - 4)) if [labelled[offset + item][1].group(1).upper() for item in range(5)] == ["A", "B", "C", "D", "E"]]
    if not sequences:
        return normalize(block), []
    start = labelled[sequences[-1]][0]
    statement = normalize("\n".join(lines[:start]))
    options: list[dict[str, str]] = []
    current: dict[str, str] | None = None
    for line in lines[start:]:
        match = OPTION_RE.match(line)
        if match:
            if current:
                options.append(current)
            current = {"label": match.group(1).upper(), "content": normalize(match.group(2))}
        elif current and line:
            current["content"] = normalize(f"{current['content']} {line}")
    if current:
        options.append(current)
    return statement, options


def area_for(day: int | None, number: int, page_text: str) -> str:
    upper = page_text.upper()
    for marker, area in (("CIÊNCIAS DA NATUREZA", "Ciências da Natureza"), ("CIENCIAS DA NATUREZA", "Ciências da Natureza"), ("CIÊNCIAS HUMANAS", "Ciências Humanas"), ("CIENCIAS HUMANAS", "Ciências Humanas"), ("MATEMÁTICA", "Matemática"), ("MATEMATICA", "Matemática"), ("LINGUAGENS", "Linguagens")):
        if marker in upper:
            return area
    if day == 1:
        return "Linguagens" if number <= 45 else "Ciências Humanas"
    if day == 2:
        return "Ciências da Natureza" if number <= 45 else "Matemática"
    return "Área não identificada"


def extract_questions(path: Path, day: int | None) -> tuple[list[dict[str, Any]], int]:
    texts, page_count, _warnings = pages_text(path)
    questions: list[dict[str, Any]] = []
    for page_number, page_text in enumerate(texts, start=1):
        matches = list(QUESTION_RE.finditer(page_text))
        for index, match in enumerate(matches):
            end = matches[index + 1].start() if index + 1 < len(matches) else len(page_text)
            statement, options = parse_options(page_text[match.end():end])
            confidence = 0.98 if statement and len(options) == 5 else 0.45
            questions.append({
                "number": int(match.group(1)),
                "area": area_for(day, int(match.group(1)), page_text),
                "statement": statement,
                "options": options,
                "sourcePage": page_number,
                "confidence": confidence,
            })
    return questions, page_count


def parse_answer_key(path: Path) -> tuple[list[dict[str, Any]], int, list[str]]:
    texts, page_count, warnings = pages_text(path)
    answers: list[dict[str, Any]] = []
    ocr = bool(warnings)
    # OCR frequently returns a compact table cell such as "1C"; accept it as
    # a *suggestion* alongside the regular "1 C" / "1 - C" PDF layouts.
    pattern = re.compile(r"(?<!\d)(\d{1,3})\s*(?:[.:\-]\s*)?([A-E])\b", re.IGNORECASE)
    for page_number, text in enumerate(texts, start=1):
        for match in pattern.finditer(text):
            number = int(match.group(1))
            if 1 <= number <= 200:
                answers.append({"number": number, "label": match.group(2).upper(), "sourcePage": page_number, "confidence": 0.72 if ocr else 0.98, "suggested": ocr})
    return answers, page_count, warnings


def marker_rects(page: fitz.Page) -> list[tuple[int, fitz.Rect]]:
    markers: list[tuple[int, fitz.Rect]] = []
    words = page.get_text("words", sort=True)
    for index, word in enumerate(words[:-1]):
        if str(word[4]).lower().rstrip(":") not in {"questão", "questao"}:
            continue
        next_word = words[index + 1]
        if not str(next_word[4]).rstrip(":").isdigit():
            continue
        markers.append((int(str(next_word[4]).rstrip(":")), fitz.Rect(word[0], word[1], next_word[2], max(word[3], next_word[3]))))
    return markers


def closest_marker(page: fitz.Page, markers: list[tuple[int, fitz.Rect]], rectangle: fitz.Rect) -> int | None:
    same_column = [(number, marker) for number, marker in markers if (marker.x0 < page.rect.width / 2) == (rectangle.x0 < page.rect.width / 2) and marker.y0 <= rectangle.y1 + 8]
    candidates = same_column or [(number, marker) for number, marker in markers if marker.y0 <= rectangle.y1 + 8]
    return max(candidates, key=lambda item: item[1].y0)[0] if candidates else None


def extract_assets(path: Path, assets_dir: Path) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    assets_dir.mkdir(parents=True, exist_ok=True)
    assets: list[dict[str, Any]] = []
    unlinked: list[dict[str, Any]] = []
    document = fitz.open(path)
    try:
        for page_index, page in enumerate(document):
            markers = marker_rects(page)
            index = 0
            seen: set[tuple[int, int, int, int, int]] = set()
            raster_rectangles: list[fitz.Rect] = []
            for image_info in page.get_images(full=True):
                xref = image_info[0]
                for rectangle in page.get_image_rects(xref):
                    if rectangle.width < 45 or rectangle.height < 30:
                        continue
                    key = (xref, round(rectangle.x0), round(rectangle.y0), round(rectangle.width), round(rectangle.height))
                    if key in seen:
                        continue
                    seen.add(key)
                    raster_rectangles.append(rectangle)
                    index += 1
                    question_number = closest_marker(page, markers, rectangle)
                    filename = f"q{question_number or 0:03d}-p{page_index + 1:03d}-{index:02d}.png"
                    target = assets_dir / filename
                    page.get_pixmap(matrix=fitz.Matrix(2, 2), clip=rectangle, alpha=False).save(target)
                    relative_file = f"assets/{filename}"
                    if question_number is None:
                        unlinked.append({"file": relative_file, "sourcePage": page_index + 1, "reason": "questão anterior não identificada na página"})
                        continue
                    digest = hashlib.sha256(target.read_bytes()).hexdigest()
                    assets.append({
                        "file": relative_file,
                        "questionNumber": question_number,
                        "placement": "after_statement",
                        "displayOrder": index - 1,
                        "mimeType": "image/png",
                        "sourcePage": page_index + 1,
                        "sourceCrop": {"x": round(rectangle.x0, 2), "y": round(rectangle.y0, 2), "width": round(rectangle.width, 2), "height": round(rectangle.height, 2)},
                        "sourceHash": digest,
                        "confidence": 0.9,
                    })
            # A graph may be vector-only and therefore absent from get_images.
            # Render each substantial drawing as a crop as well. Their visual
            # association is deliberately marked as mandatory human review by
            # the API; this heuristic must never silently publish a vector.
            vector_seen: set[tuple[int, int, int, int]] = set()
            for drawing in page.get_drawings():
                rectangle = drawing.get("rect")
                if not isinstance(rectangle, fitz.Rect) or rectangle.width < 45 or rectangle.height < 30:
                    continue
                if rectangle.width > page.rect.width * 0.9 and rectangle.height > page.rect.height * 0.9:
                    continue  # page frame, not a question asset
                if any(rectangle.intersects(raster) for raster in raster_rectangles):
                    continue  # avoid duplicating an image border/overlay
                key = (round(rectangle.x0), round(rectangle.y0), round(rectangle.width), round(rectangle.height))
                if key in vector_seen:
                    continue
                vector_seen.add(key)
                index += 1
                question_number = closest_marker(page, markers, rectangle)
                filename = f"q{question_number or 0:03d}-p{page_index + 1:03d}-{index:02d}-vector.png"
                target = assets_dir / filename
                page.get_pixmap(matrix=fitz.Matrix(2, 2), clip=rectangle, alpha=False).save(target)
                relative_file = f"assets/{filename}"
                if question_number is None:
                    unlinked.append({"file": relative_file, "sourcePage": page_index + 1, "reason": "ativo vetorial sem questão anterior identificada"})
                    continue
                digest = hashlib.sha256(target.read_bytes()).hexdigest()
                assets.append({
                    "file": relative_file,
                    "questionNumber": question_number,
                    "placement": "after_statement",
                    "displayOrder": index - 1,
                    "mimeType": "image/png",
                    "sourcePage": page_index + 1,
                    "sourceCrop": {"x": round(rectangle.x0, 2), "y": round(rectangle.y0, 2), "width": round(rectangle.width, 2), "height": round(rectangle.height, 2)},
                    "sourceHash": digest,
                    "confidence": 0.65,
                    "isVector": True,
                })
    finally:
        document.close()
    return assets, unlinked


def metadata_from(texts: list[str]) -> dict[str, list[str]]:
    joined = "\n".join(texts).upper()
    result: dict[str, list[str]] = {}
    years = sorted(set(re.findall(r"\b20\d{2}\b", joined)))
    if years:
        result["year"] = years
    days = sorted({match.group(1) or match.group(2) for match in re.finditer(r"DIA\s*([1-6])\b|\b([1-6])(?:º|ª)?\s*DIA", joined)})
    if days:
        result["day"] = days
    colors = [normalized for source, normalized in COLORS.items() if source in joined]
    if colors:
        result["color"] = sorted(set(colors))
    languages: list[str] = []
    if "INGLÊS" in joined or "INGLES" in joined:
        languages.append("en")
    if "ESPANHOL" in joined:
        languages.append("es")
    if len(languages) == 1:
        result["language"] = languages
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Extrai uma prévia local e revisável de prova + gabarito.")
    parser.add_argument("--exam", type=Path, required=True)
    parser.add_argument("--key", type=Path, required=True)
    parser.add_argument("--out-json", type=Path, required=True)
    parser.add_argument("--assets-dir", type=Path, required=True)
    parser.add_argument("--day", type=int, choices=range(1, 7), help="Dia informado pelo administrador; usado apenas para classificar a área estrutural.")
    args = parser.parse_args()

    proof_text, _, _ = pages_text(args.exam)
    detected = metadata_from(proof_text)
    day = args.day if args.day is not None else (int(detected["day"][0]) if len(detected.get("day", [])) == 1 else None)
    questions, proof_pages = extract_questions(args.exam, day)
    answers, key_pages, warnings = parse_answer_key(args.key)
    assets, unlinked_assets = extract_assets(args.exam, args.assets_dir)
    output = {
        "questions": questions,
        "answerKey": answers,
        "assets": assets,
        "unlinkedAssets": unlinked_assets,
        "detectedMetadata": detected,
        "pageCounts": {"exam": proof_pages, "answerKey": key_pages},
        "warnings": warnings,
    }
    args.out_json.parent.mkdir(parents=True, exist_ok=True)
    args.out_json.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
