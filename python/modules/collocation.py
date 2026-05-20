from __future__ import annotations

import math
import re
from collections import Counter
from typing import Any

from .common import documents, tokenize
from .lang_loader import get_language_config, tokenizer_source


def _tokens(text: str, language: str | None) -> list[str]:
    return [token for token in tokenize(text, language=language) if len(token) > 1]


def run(payload: dict[str, Any]) -> dict[str, Any]:
    docs = documents(payload)
    query = str(payload.get("query") or "").strip()
    window = int(payload.get("window") or 5)
    top_n = int(payload.get("top_n") or 30)
    language = payload.get("language") or "en"
    lang_config = get_language_config(language)
    if not query:
        return {"query": query, "rows": [], "node_count": 0, "tokenizer_source": tokenizer_source(lang_config)}

    node_pattern = re.compile(re.escape(query), flags=re.IGNORECASE | re.UNICODE)
    collocate_counts: Counter[str] = Counter()
    corpus_counts: Counter[str] = Counter()
    node_count = 0
    window_token_total = 0

    for document in docs:
        content = str(document.get("content") or "")
        corpus_counts.update(_tokens(content, language))
        for match in node_pattern.finditer(content):
            node_count += 1
            left_context = content[max(0, match.start() - 420) : match.start()]
            right_context = content[match.end() : match.end() + 420]
            left_tokens = _tokens(left_context, language)[-window:]
            right_tokens = _tokens(right_context, language)[:window]
            collocates = list({token for token in [*left_tokens, *right_tokens] if token.casefold() != query.casefold()})
            window_token_total += len(collocates)
            collocate_counts.update(collocates)

    total_tokens = max(1, sum(corpus_counts.values()))
    rows = []
    for term, observed in collocate_counts.items():
        frequency = corpus_counts[term]
        if observed <= 0 or frequency <= 0 or node_count <= 0:
            continue
        expected = (frequency / total_tokens) * max(1, window_token_total)
        pmi = math.log2((observed * total_tokens) / max(1, node_count * frequency))
        dice = min(1.0, (2 * observed) / max(1, node_count + frequency))
        t_score = (observed - expected) / math.sqrt(observed)
        rows.append(
            {
                "term": term,
                "observed": observed,
                "frequency": frequency,
                "expected": round(expected, 4),
                "pmi": round(pmi, 4),
                "dice": round(dice, 6),
                "t_score": round(t_score, 4),
                "per_million": round((frequency / total_tokens) * 1_000_000, 2),
            }
        )

    rows.sort(key=lambda item: (item["pmi"], item["observed"]), reverse=True)
    return {
        "query": query,
        "window": window,
        "node_count": node_count,
        "window_token_total": window_token_total,
        "rows": rows[:top_n],
        "tokenizer_source": tokenizer_source(lang_config),
    }
