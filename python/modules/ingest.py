from __future__ import annotations

import base64
import tempfile
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


def _document(filename: str, content: str) -> dict[str, Any]:
    return {
        "id": str(uuid4()),
        "filename": filename,
        "content": content,
        "metadata": {
            "tags": [],
            "language": _detect_language(content),
        },
    }


def _read_document_path(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix in {".txt", ".md", ".csv", ".tsv"}:
        return path.read_text(encoding="utf-8", errors="replace")
    if suffix == ".pdf":
        return _read_pdf(path)
    if suffix == ".docx":
        return _read_docx(path)
    return path.read_text(encoding="utf-8", errors="replace")


def _read_path(path: Path) -> dict[str, Any]:
    return _document(path.name, _read_document_path(path))


def _read_bytes(filename: str, content_bytes: bytes) -> dict[str, Any]:
    suffix = Path(filename).suffix.lower()
    if suffix in {".txt", ".md", ".csv", ".tsv"}:
        content = content_bytes.decode("utf-8", errors="replace")
    else:
        with tempfile.NamedTemporaryFile(suffix=suffix or ".txt", delete=True) as temp_file:
            temp_file.write(content_bytes)
            temp_file.flush()
            content = _read_document_path(Path(temp_file.name))

    return _document(filename, content)


def run(payload: dict[str, Any]) -> dict[str, Any]:
    paths = [Path(path).expanduser() for path in payload.get("paths", [])]
    docs: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []

    for path in paths:
        if not path.exists():
            errors.append({"filename": path.name, "error": "file not found"})
            continue
        try:
            docs.append(_read_path(path))
        except Exception as exc:  # noqa: BLE001
            errors.append({"filename": path.name, "error": str(exc)})

    for item in payload.get("files", []):
        filename = str(item.get("filename") or "document.txt")
        encoded = item.get("content_base64")
        if not isinstance(encoded, str):
            errors.append({"filename": filename, "error": "missing base64 content"})
            continue
        try:
            docs.append(_read_bytes(filename, base64.b64decode(encoded, validate=True)))
        except Exception as exc:  # noqa: BLE001
            errors.append({"filename": filename, "error": str(exc)})

    return {"documents": docs, "count": len(docs), "errors": errors}
