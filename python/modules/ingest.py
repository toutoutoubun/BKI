from __future__ import annotations

from pathlib import Path
from typing import Any
from uuid import uuid4


def _read_pdf(path: Path) -> str:
    try:
        from pdfminer.high_level import extract_text
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError("pdfminer.six is required to read PDF files") from exc
    return extract_text(str(path))


def _read_docx(path: Path) -> str:
    try:
        from docx import Document
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError("python-docx is required to read DOCX files") from exc
    document = Document(str(path))
    return "\n".join(paragraph.text for paragraph in document.paragraphs)


def _detect_language(content: str) -> str:
    if any("\u3040" <= char <= "\u30ff" or "\u4e00" <= char <= "\u9fff" for char in content):
        return "ja"
    try:
        from langdetect import detect

        detected = detect(content[:5000])
        return detected if detected in {"en", "fr", "af"} else "en"
    except Exception:  # noqa: BLE001
        return "en"


def _read_path(path: Path) -> dict[str, Any]:
    suffix = path.suffix.lower()
    if suffix in {".txt", ".md", ".csv", ".tsv"}:
        content = path.read_text(encoding="utf-8", errors="replace")
    elif suffix == ".pdf":
        content = _read_pdf(path)
    elif suffix == ".docx":
        content = _read_docx(path)
    else:
        content = path.read_text(encoding="utf-8", errors="replace")

    return {
        "id": str(uuid4()),
        "filename": path.name,
        "content": content,
        "metadata": {
            "tags": [],
            "language": _detect_language(content),
        },
    }


def run(payload: dict[str, Any]) -> dict[str, Any]:
    paths = [Path(path).expanduser() for path in payload.get("paths", [])]
    docs = [_read_path(path) for path in paths if path.exists()]
    return {"documents": docs, "count": len(docs)}

