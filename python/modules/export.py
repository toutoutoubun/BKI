from __future__ import annotations

import csv
from io import StringIO
from typing import Any


def _csv(rows: list[dict[str, Any]]) -> str:
    if not rows:
        return ""
    buffer = StringIO()
    writer = csv.DictWriter(buffer, fieldnames=list(rows[0].keys()))
    writer.writeheader()
    writer.writerows(rows)
    return buffer.getvalue()


def _markdown(payload: dict[str, Any]) -> str:
    title = payload.get("title") or "BKI Report"
    rows = payload.get("rows", [])
    summary = payload.get("summary", {})
    sections = payload.get("sections", [])
    lines = [f"# {title}", ""]

    if isinstance(summary, dict) and summary:
        lines.extend(["## Summary", ""])
        for key, value in summary.items():
            lines.append(f"- **{key}**: {value}")
        lines.append("")

    if isinstance(sections, list):
        for section in sections:
            if not isinstance(section, dict):
                continue
            section_title = section.get("title")
            if section_title:
                lines.extend([f"## {section_title}", ""])
            body = section.get("body")
            if body:
                lines.extend([str(body), ""])
            section_rows = section.get("rows", [])
            if section_rows:
                lines.extend(_markdown_table(section_rows))
                lines.append("")

    if rows:
        lines.extend(_markdown_table(rows))
    return "\n".join(lines)


def _markdown_table(rows: list[dict[str, Any]]) -> list[str]:
    if not rows:
        return []
    headers = list(rows[0].keys())
    lines = [
        "| " + " | ".join(_escape_markdown_cell(header) for header in headers) + " |",
        "| " + " | ".join("---" for _ in headers) + " |",
    ]
    for row in rows:
        lines.append("| " + " | ".join(_escape_markdown_cell(row.get(header, "")) for header in headers) + " |")
    return lines


def _escape_markdown_cell(value: Any) -> str:
    return str(value).replace("|", "\\|").replace("\n", "<br>")


def run(payload: dict[str, Any]) -> dict[str, Any]:
    fmt = payload.get("format", "csv")
    rows = payload.get("rows", [])
    if fmt == "markdown":
        return {"content": _markdown(payload), "mime": "text/markdown"}
    return {"content": _csv(rows), "mime": "text/csv"}
