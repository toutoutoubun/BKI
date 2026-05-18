from __future__ import annotations

from collections import defaultdict
from typing import Any

from .common import compile_terms, documents, group_key, ordered_periods


def run(payload: dict[str, Any]) -> dict[str, Any]:
    docs = documents(payload)
    keywords: dict[str, list[str]] = payload.get("keywords", {})
    group_by = payload.get("group_by", "month")

    counts: dict[str, dict[str, int]] = {}
    period_keys: list[str] = []

    for group_name, terms in keywords.items():
        counts[group_name] = defaultdict(int)
        patterns = compile_terms(terms)
        for document in docs:
            period = group_key(document, group_by)
            period_keys.append(period)
            content = str(document.get("content") or "")
            counts[group_name][period] += sum(len(pattern.findall(content)) for pattern in patterns)
        counts[group_name] = dict(counts[group_name])

    periods = ordered_periods(period_keys)
    table = []
    for period in periods:
        row: dict[str, str | int] = {"period": period}
        for group_name in keywords:
            row[group_name] = counts.get(group_name, {}).get(period, 0)
        table.append(row)

    return {
        "periods": periods,
        "months": periods,
        "groups": list(keywords.keys()),
        "counts": counts,
        "table": table,
    }

