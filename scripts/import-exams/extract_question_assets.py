"""Extract reviewable visual assets from an official ENEM PDF.

The script only prepares a reviewed import: it never writes to the database.
It finds raster figures in the PDF, associates each one with the closest prior
question label in the same column, renders a PNG crop, and appends an asset to
an output JSON. Review every association and placement before persistence.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import quote

import fitz  # PyMuPDF


@dataclass(frozen=True)
class Marker:
    number: int
    rect: fitz.Rect


def find_markers(page: fitz.Page, question_numbers: set[int]) -> list[Marker]:
    markers: list[Marker] = []
    words = page.get_text("words", sort=True)
    for index, word in enumerate(words[:-1]):
        text = str(word[4]).lower().rstrip(":")
        next_text = str(words[index + 1][4]).rstrip(":")
        if text not in {"questão", "questao"} or not next_text.isdigit():
            continue
        number = int(next_text)
        if number not in question_numbers:
            continue
        next_word = words[index + 1]
        markers.append(Marker(number, fitz.Rect(word[0], word[1], next_word[2], max(word[3], next_word[3]))))
    return markers


def is_same_column(page: fitz.Page, marker: Marker, image: fitz.Rect) -> bool:
    midpoint = page.rect.width / 2
    return (marker.rect.x0 < midpoint) == (image.x0 < midpoint)


def closest_question(page: fitz.Page, markers: list[Marker], image: fitz.Rect) -> int | None:
    before = [marker for marker in markers if marker.rect.y0 <= image.y1 + 8 and is_same_column(page, marker, image)]
    if not before:
        before = [marker for marker in markers if marker.rect.y0 <= image.y1 + 8]
    return max(before, key=lambda marker: marker.rect.y0).number if before else None


def public_url(base_url: str, relative_path: Path) -> str:
    encoded = "/".join(quote(part) for part in relative_path.as_posix().split("/"))
    return f"{base_url.rstrip('/')}/{encoded}"


def crop_name(question_number: int, page_number: int, asset_index: int) -> str:
    return f"q{question_number:02d}-p{page_number:02d}-{asset_index:02d}.png"


def append_asset(question: dict, asset: dict) -> None:
    assets = question.setdefault("assets", [])
    if any(item.get("sourceHash") == asset["sourceHash"] for item in assets):
        return
    asset["displayOrder"] = 1 + max((int(item.get("displayOrder", -1)) for item in assets), default=-1)
    assets.append(asset)


def is_variant_page(payload: dict, question_number: int, page_number: int) -> bool:
    """Avoid assigning the Spanish first-five-question pages to English (and vice versa).

    The official 2025 day-one booklet places English on pages 2-3 and Spanish
    on pages 4-5. Questions from 6 onward are common to both variants.
    """
    language = payload.get("exam", {}).get("language")
    if question_number > 5 or language not in {"en", "es"}:
        return True
    return page_number in ({"en": {2, 3}, "es": {4, 5}}[language])


def extract(pdf_path: Path, payload: dict, output_dir: Path, base_url: str) -> tuple[int, list[dict]]:
    questions = {int(question["number"]): question for question in payload["questions"]}
    output_dir.mkdir(parents=True, exist_ok=True)
    extracted = 0
    skipped: list[dict] = []
    document = fitz.open(pdf_path)
    try:
        for page_index, page in enumerate(document):
            markers = find_markers(page, set(questions))
            asset_index = 0
            for image_info in page.get_images(full=True):
                xref = image_info[0]
                for rectangle in page.get_image_rects(xref):
                    if rectangle.width < 45 or rectangle.height < 30:
                        continue
                    asset_index += 1
                    question_number = closest_question(page, markers, rectangle)
                    if question_number is None:
                        skipped.append({"page": page_index + 1, "xref": xref, "reason": "questão não identificada"})
                        continue
                    if not is_variant_page(payload, question_number, page_index + 1):
                        skipped.append({"page": page_index + 1, "xref": xref, "reason": "página de outro idioma"})
                        continue
                    filename = crop_name(question_number, page_index + 1, asset_index)
                    path = output_dir / filename
                    pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), clip=rectangle, alpha=False)
                    pixmap.save(path)
                    digest = hashlib.sha256(path.read_bytes()).hexdigest()
                    append_asset(questions[question_number], {
                        "url": public_url(base_url, path.relative_to(output_dir.parent)),
                        "storagePath": path.relative_to(output_dir.parent).as_posix(),
                        "placement": "before_statement",
                        "mimeType": "image/png",
                        "altText": f"Figura extraída da questão {question_number}. Revisar a descrição antes da publicação.",
                        "sourcePage": page_index + 1,
                        "sourceCrop": {"x": round(rectangle.x0, 2), "y": round(rectangle.y0, 2), "width": round(rectangle.width, 2), "height": round(rectangle.height, 2)},
                        "sourceHash": digest,
                    })
                    extracted += 1
    finally:
        document.close()
    return extracted, skipped


def main() -> None:
    parser = argparse.ArgumentParser(description="Extrai imagens de um PDF para um JSON de importação revisável.")
    parser.add_argument("--exam", type=Path, required=True, help="PDF oficial do caderno.")
    parser.add_argument("--payload", type=Path, required=True, help="JSON gerado por extract_local_pdf.py.")
    parser.add_argument("--out-json", type=Path, required=True, help="Novo JSON enriquecido; o original não é alterado.")
    parser.add_argument("--out-dir", type=Path, default=Path("data/exam-assets/import"), help="Diretório público local para os PNGs.")
    parser.add_argument("--base-url", default="http://localhost:3001/exam-assets", help="URL pública correspondente a --out-dir.")
    args = parser.parse_args()

    payload = json.loads(args.payload.read_text(encoding="utf-8"))
    if not isinstance(payload, dict) or not isinstance(payload.get("questions"), list):
        raise RuntimeError("O payload deve conter uma lista de questões.")
    extracted, skipped = extract(args.exam, payload, args.out_dir, args.base_url)
    args.out_json.parent.mkdir(parents=True, exist_ok=True)
    args.out_json.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"status": "review_required", "assets": extracted, "payload": str(args.out_json), "directory": str(args.out_dir), "skipped": skipped}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
