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
    lines = [f"# {title}", ""]
    if rows:
        headers = list(rows[0].keys())
        lines.append("| " + " | ".join(headers) + " |")
        lines.append("| " + " | ".join("---" for _ in headers) + " |")
        for row in rows:
            lines.append("| " + " | ".join(str(row.get(header, "")) for header in headers) + " |")
    return "\n".join(lines)


def run(payload: dict[str, Any]) -> dict[str, Any]:
    fmt = payload.get("format", "csv")
    rows = payload.get("rows", [])
    if fmt == "markdown":
        return {"content": _markdown(payload), "mime": "text/markdown"}
    return {"content": _csv(rows), "mime": "text/csv"}

