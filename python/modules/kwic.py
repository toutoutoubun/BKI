from __future__ import annotations

import re
from typing import Any

from .common import documents


def run(payload: dict[str, Any]) -> dict[str, Any]:
    docs = documents(payload)
    query = str(payload.get("query") or "")
    window = int(payload.get("window") or 40)
    max_results = int(payload.get("max_results") or 200)
    pattern = re.compile(query, flags=re.IGNORECASE | re.UNICODE)
    results: list[dict[str, Any]] = []

    for document in docs:
        content = str(document.get("content") or "")
        metadata = document.get("metadata") or {}
        for match in pattern.finditer(content):
            results.append(
                {
                    "document_id": document.get("id"),
                    "document_name": document.get("filename"),
                    "date": metadata.get("date"),
                    "left": content[max(0, match.start() - window) : match.start()],
                    "keyword": match.group(0),
                    "right": content[match.end() : match.end() + window],
                    "offset": match.start(),
                }
            )
            if len(results) >= max_results:
                return {"results": results}

    return {"results": results}

