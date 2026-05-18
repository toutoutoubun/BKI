from __future__ import annotations

from collections import Counter
from itertools import combinations
from typing import Any

from .common import compile_terms, documents


def run(payload: dict[str, Any]) -> dict[str, Any]:
    docs = documents(payload)
    terms = [str(term) for term in payload.get("terms", []) if str(term).strip()]
    window = int(payload.get("window") or 120)
    patterns = {term: compile_terms([term])[0] for term in terms}
    pair_counts: Counter[tuple[str, str]] = Counter()

    for document in docs:
        content = str(document.get("content") or "")
        hits: list[tuple[int, str]] = []
        for term, pattern in patterns.items():
            hits.extend((match.start(), term) for match in pattern.finditer(content))
        hits.sort()

        for (left_pos, left_term), (right_pos, right_term) in combinations(hits, 2):
            if left_term == right_term:
                continue
            if right_pos - left_pos <= window:
                pair_counts[tuple(sorted((left_term, right_term)))] += 1

    edges = [{"source": source, "target": target, "weight": weight} for (source, target), weight in pair_counts.items()]
    return {"nodes": [{"id": term} for term in terms], "edges": edges}

