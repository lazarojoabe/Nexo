"""Create reviewable ENEM JSON imports from downloaded official PDFs.

The INEP booklet uses a multi-column layout. PyMuPDF's text-order extraction
keeps each question and its alternatives together, unlike a plain line parser.
This remains a draft generator: compare the JSON with the PDFs before using
the existing ``pnpm import:exams ... --persist`` command.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

import fitz  # PyMuPDF


QUESTION_RE = re.compile(r"(?:^|\n)\s*Quest(?:\u00e3|\u00e1)o\s+(\d{1,2})\s*", re.IGNORECASE)
OPTION_RE = re.compile(r"^\s*([A-E])\s+(.*)$")

ENGLISH_KEYS = {1: "D", 2: "D", 3: "D", 4: "E", 5: "A"}
SPANISH_KEYS = {1: "B", 2: "A", 3: "D", 4: "D", 5: "C"}
COMMON_KEYS = {
    6: "E", 7: "C", 8: "D", 9: "C", 10: "E", 11: "B", 12: "C", 13: "E",
    14: "C", 15: "A", 16: "E", 17: "C", 18: "A", 19: "E", 20: "B", 21: "C",
    22: "B", 23: "C", 24: "B", 25: "E", 26: "B", 27: "A", 28: "B", 29: "A",
    30: "B", 31: "D", 32: "E", 33: "B", 34: "C", 35: "E", 36: "D", 37: "A",
    38: "B", 39: "C", 40: "A", 41: "B", 42: "A", 43: "D", 44: "D", 45: "C",
    46: "E", 47: "D", 48: "E", 49: "C", 50: "A", 51: "D", 52: "C", 53: "E",
    54: "E", 55: "D", 56: "C", 57: "A", 58: "D", 59: "B", 60: "D", 61: "E",
    62: "B", 63: "B", 64: "A", 65: "C", 66: "D", 67: "D", 68: "E", 69: "C",
    70: "B", 71: "A", 72: "D", 73: "A", 74: "B", 75: "B", 76: "C", 77: "A",
    78: "B", 79: "A", 80: "C", 81: "E", 82: "E", 83: "D", 84: "D", 85: "B",
    86: "C", 87: "B", 88: "C", 89: "E", 90: "A",
}


def normalize(value: str) -> str:
    value = value.replace("\u00a0", " ")
    value = re.sub(r"[ \t]+", " ", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()


def clean_page_noise(text: str) -> str:
    text = re.sub(r"\*010175AZ\d+\*", "", text)
    lines: list[str] = []
    for raw_line in text.splitlines():
        line = normalize(raw_line)
        if not line or "ENEM2025" in line or "001100117755" in line:
            continue
        if "CADERNO 1" in line and ("AZUL" in line or "VERMELHO" in line):
            continue
        lines.append(line)
    return "\n".join(lines)


def parse_options(block: str) -> tuple[str, list[dict[str, str]]]:
    lines = block.splitlines()
    labelled = [(index, match) for index, line in enumerate(lines) if (match := OPTION_RE.match(line))]
    starts = [offset for offset in range(len(labelled) - 4) if [labelled[offset + item][1].group(1) for item in range(5)] == ["A", "B", "C", "D", "E"]]
    if not starts:
        return normalize(block), []
    first_option = labelled[starts[-1]][0]
    statement = normalize("\n".join(lines[:first_option]))
    options: list[dict[str, str]] = []
    current: dict[str, str] | None = None
    for line in lines[first_option:]:
        match = OPTION_RE.match(line)
        if match:
            if current:
                options.append(current)
            current = {"label": match.group(1), "content": normalize(match.group(2))}
        elif current:
            current["content"] = normalize(f"{current['content']} {line}")
    if current:
        options.append(current)
    return statement, options


def parse_answer_key(pdf_path: Path) -> tuple[dict[int, str], dict[int, str], dict[int, str]]:
    """Read the three answer-key columns from the official one-page PDF."""
    document = fitz.open(pdf_path)
    try:
        text = document[0].get_text("text")
    finally:
        document.close()
    english: dict[int, str] = {}
    spanish: dict[int, str] = {}
    common: dict[int, str] = {}
    tokens = [line.strip() for line in text.splitlines() if line.strip()]
    for index, token in enumerate(tokens):
        if not token.isdigit() or not 1 <= int(token) <= 90:
            continue
        number = int(token)
        if number <= 5 and index + 2 < len(tokens) and tokens[index + 1] in "ABCDE" and tokens[index + 2] in "ABCDE":
            english.setdefault(number, tokens[index + 1])
            spanish.setdefault(number, tokens[index + 2])
        elif index + 1 < len(tokens) and tokens[index + 1] in "ABCDE":
            common.setdefault(number, tokens[index + 1])
    if set(english) != set(range(1, 6)) or set(spanish) != set(range(1, 6)) or set(common) != set(range(6, 91)):
        raise RuntimeError("Não foi possível ler todas as colunas do gabarito oficial.")
    return english, spanish, common


def extract_questions(pdf_path: Path, first_page: int, last_page: int) -> dict[int, dict[str, Any]]:
    result: dict[int, dict[str, Any]] = {}
    document = fitz.open(pdf_path)
    try:
        for page_index in range(first_page - 1, last_page):
            text = clean_page_noise(document[page_index].get_text("text"))
            matches = list(QUESTION_RE.finditer(text))
            for index, match in enumerate(matches):
                number = int(match.group(1))
                end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
                statement, options = parse_options(text[match.end() : end])
                candidate = {"number": number, "statement": statement, "options": options}
                if number not in result or len(options) > len(result[number]["options"]):
                    result[number] = candidate
    finally:
        document.close()
    return result


def build_payload(questions: dict[int, dict[str, Any]], language: str, keys: dict[int, str]) -> dict[str, Any]:
    return {
        "sourceUrl": "https://download.inep.gov.br/enem/provas_e_gabaritos/2025_PV_impresso_D1_CD1.pdf",
        "sourceVersion": "Inep 2025 — Caderno 1 Azul — gabarito oficial",
        "exam": {"year": 2025, "day": 1, "color": "azul", "language": language, "version": "caderno-1"},
        "questions": [
            {
                "number": number,
                "area": "Linguagens" if number <= 45 else "Ciências Humanas",
                "statement": question["statement"],
                "options": question["options"],
                "correctOptionLabel": keys[number],
            }
            for number, question in sorted(questions.items())
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--exam", type=Path, required=True)
    parser.add_argument("--key", type=Path, required=True)
    parser.add_argument("--out-dir", type=Path, required=True)
    args = parser.parse_args()

    english_keys, spanish_keys, common_keys = parse_answer_key(args.key)
    common = {**extract_questions(args.exam, 6, 19), **extract_questions(args.exam, 22, 31)}
    english = {**extract_questions(args.exam, 2, 3), **common}
    spanish = {**extract_questions(args.exam, 4, 5), **common}
    args.out_dir.mkdir(parents=True, exist_ok=True)
    for language, questions, keys in (("en", english, {**english_keys, **common_keys}), ("es", spanish, {**spanish_keys, **common_keys})):
        missing = sorted(set(range(1, 91)) - set(questions))
        invalid = sorted(number for number, question in questions.items() if len(question["options"]) != 5)
        if missing or invalid:
            raise RuntimeError(f"{language}: questões ausentes={missing}; questões sem 5 alternativas={invalid}")
        path = args.out_dir / f"enem-2025-dia-1-azul-{language}.json"
        path.write_text(json.dumps(build_payload(questions, language, keys), ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps({"language": language, "questions": len(questions), "path": str(path)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
