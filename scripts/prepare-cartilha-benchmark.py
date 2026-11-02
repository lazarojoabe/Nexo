#!/usr/bin/env python3
"""Create a local, non-versioned visual benchmark from an authorized essay booklet.

The generated files intentionally remain outside version control: they include
rendered copies of the source pages. The manifest contains provenance and
expected scores, but never the extracted essay text.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    import pypdfium2 as pdfium
    from pypdf import PdfReader
except ModuleNotFoundError as error:
    raise SystemExit(
        "Dependência ausente. Instale pypdf e pypdfium2 no Python usado para executar este script."
    ) from error


DEFAULT_TOPIC = "Democratização do acesso ao cinema no Brasil"
SOURCE_NAME = "Cartilha Redação a Mil 2.0 - Lucas Felpi"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Prepara páginas de transcrição de uma cartilha autorizada para benchmark local.",
    )
    parser.add_argument("--pdf", required=True, type=Path, help="Caminho do PDF de origem autorizado.")
    parser.add_argument("--output", type=Path, default=Path("tmp/cartilha-2019"), help="Pasta local de saída (padrão: tmp/cartilha-2019).")
    parser.add_argument("--topic", default=DEFAULT_TOPIC, help="Tema esperado das redações.")
    parser.add_argument("--license", required=True, help="Licença ou autorização de uso registrada pelo responsável.")
    parser.add_argument("--authorization-confirmed", action="store_true", help="Confirma que o uso local para calibração foi autorizado.")
    parser.add_argument("--expected-count", type=int, default=44, help="Quantidade esperada de redações (padrão: 44).")
    return parser.parse_args()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def normalized_page_text(page: Any) -> str:
    return re.sub(r"\s+", " ", page.extract_text() or "").strip()


def author_from_cover_page(page: Any, position: int) -> str:
    lines = [re.sub(r"\s+", " ", line).strip() for line in (page.extract_text() or "").splitlines()]
    candidate = next((line for line in lines if line and "Foto:" not in line), "")
    return candidate or f"Autor {position:02d}"


def main() -> None:
    args = parse_args()
    source = args.pdf.expanduser().resolve()
    output = args.output.expanduser().resolve()
    if not source.is_file():
        raise SystemExit(f"PDF não encontrado: {source}")
    if not args.authorization_confirmed:
        raise SystemExit("Confirme a autorização de uso com --authorization-confirmed antes de gerar o benchmark local.")
    if len(args.license.strip()) < 3:
        raise SystemExit("Informe uma licença ou autorização de uso verificável com --license.")

    reader = PdfReader(str(source))
    cover_indexes = [index for index, page in enumerate(reader.pages[:-1]) if "Foto:" in (page.extract_text() or "")]
    if len(cover_indexes) != args.expected_count:
        raise SystemExit(
            f"Foram encontradas {len(cover_indexes)} páginas de espelho; eram esperadas {args.expected_count}. "
            "Confira se o PDF e a quantidade esperada correspondem à edição informada."
        )

    pages_dir = output / "pages"
    pages_dir.mkdir(parents=True, exist_ok=True)
    rendered = pdfium.PdfDocument(str(source))
    entries: list[dict[str, Any]] = []
    try:
        for position, cover_index in enumerate(cover_indexes, start=1):
            transcription_index = cover_index + 1
            image_path = pages_dir / f"cartilha-2019-{position:02d}-transcricao.png"
            page = rendered[transcription_index]
            try:
                # 1.8x preserves a full typed page legibly while keeping the
                # 44-case local benchmark practical to prepare on a laptop.
                bitmap = page.render(scale=1.8)
                image = bitmap.to_pil()
                image.save(image_path, format="PNG")
            finally:
                page.close()

            entries.append({
                "id": f"cartilha-2019-{position:02d}",
                "author": author_from_cover_page(reader.pages[cover_index], position),
                "sourcePage": transcription_index + 1,
                "inputImage": str(image_path.relative_to(output)).replace("\\", "/"),
                "inputImageSha256": sha256_file(image_path),
                "expected": {"totalScore": 1000, "competencyScores": [200, 200, 200, 200, 200]},
            })
    finally:
        rendered.close()

    manifest = {
        "schemaVersion": 1,
        "collection": {
            "name": SOURCE_NAME,
            "sourceFile": source.name,
            "sourceSha256": sha256_file(source),
            "topic": args.topic.strip(),
            "year": 2019,
            "license": args.license.strip(),
            "authorizationConfirmed": True,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "usage": "benchmark_local_regression_only",
        },
        "entries": entries,
    }
    manifest_path = output / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"manifest": str(manifest_path), "entries": len(entries), "sourceSha256": manifest["collection"]["sourceSha256"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
