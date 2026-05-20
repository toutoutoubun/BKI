from __future__ import annotations

import math
from collections import Counter, defaultdict
from typing import Any

from .common import documents, group_key, tokenize
from .lang_loader import get_language_config, tokenizer_source


def _safe_log_likelihood(observed: int, expected: float) -> float:
    if observed <= 0 or expected <= 0:
        return 0.0
    return observed * math.log(observed / expected)


def _tokens(document: dict[str, Any], language: str | None) -> list[str]:
    return [token for token in tokenize(str(document.get("content") or ""), language=language) if len(token) > 1]


def run(payload: dict[str, Any]) -> dict[str, Any]:
    docs = documents(payload)
    group_by = str(payload.get("group_by") or "category")
    language = payload.get("language") or "en"
    top_n = int(payload.get("top_n") or 30)
    min_frequency = int(payload.get("min_frequency") or 2)
    lang_config = get_language_config(language)

    group_counts: dict[str, Counter[str]] = defaultdict(Counter)
    group_totals: Counter[str] = Counter()
    overall: Counter[str] = Counter()

    for document in docs:
        key = group_key(document, group_by)
        counts = Counter(_tokens(document, language))
        group_counts[key].update(counts)
        group_totals[key] += sum(counts.values())
        overall.update(counts)

    corpus_total = sum(overall.values())
    rows: list[dict[str, Any]] = []
    for group, counts in group_counts.items():
        group_total = group_totals[group]
        rest_total = max(0, corpus_total - group_total)
        if group_total == 0 or rest_total == 0:
            continue

        scored: list[dict[str, Any]] = []
        for term, group_frequency in counts.items():
            rest_frequency = overall[term] - group_frequency
            if group_frequency + rest_frequency < min_frequency:
                continue
            term_total = group_frequency + rest_frequency
            expected_group = group_total * term_total / corpus_total if corpus_total else 0
            expected_rest = rest_total * term_total / corpus_total if corpus_total else 0
            log_likelihood = 2 * (
                _safe_log_likelihood(group_frequency, expected_group)
                + _safe_log_likelihood(rest_frequency, expected_rest)
            )
            group_rate = group_frequency / group_total
            rest_rate = rest_frequency / rest_total
            log_ratio = math.log2((group_rate + 0.000001) / (rest_rate + 0.000001))
            scored.append(
                {
                    "group": group,
                    "term": term,
                    "group_frequency": group_frequency,
                    "rest_frequency": rest_frequency,
                    "expected": round(expected_group, 4),
                    "log_likelihood": round(log_likelihood, 4),
                    "log_ratio": round(log_ratio, 4),
                    "group_per_million": round(group_rate * 1_000_000, 2),
                    "rest_per_million": round(rest_rate * 1_000_000, 2),
                    "direction": "overused" if group_rate >= rest_rate else "underused",
                }
            )
        rows.extend(sorted(scored, key=lambda item: (item["log_likelihood"], abs(item["log_ratio"])), reverse=True)[:top_n])

    return {
        "group_by": group_by,
        "groups": sorted(group_counts.keys()),
        "rows": rows,
        "tokenizer_source": tokenizer_source(lang_config),
    }
