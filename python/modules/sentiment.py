from __future__ import annotations

from collections import defaultdict
from typing import Any

from .common import compile_terms, documents, group_key, ordered_periods
from .lang_loader import load_sentiment_lexicon


def run(payload: dict[str, Any]) -> dict[str, Any]:
    docs = documents(payload)
    targets: dict[str, list[str]] = payload.get("targets", {})
    language = payload.get("language") or "en"
    lexicon_source = "request"
    lexicon_items = payload.get("lexicon", [])
    if not lexicon_items:
        lexicon_items = load_sentiment_lexicon(language)
        lexicon_source = "language_addon"
    lexicon = {str(item.get("word")): float(item.get("score", 0)) for item in lexicon_items}
    window = int(payload.get("window") or 80)
    group_by = payload.get("group_by", "month")

    totals: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    hit_counts: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    hits: dict[str, dict[str, list[dict[str, Any]]]] = defaultdict(lambda: defaultdict(list))
    periods: list[str] = []

    lexicon_patterns = [(word, score, compile_terms([word])[0]) for word, score in lexicon.items() if word]

    for target_name, terms in targets.items():
        target_patterns = compile_terms(terms)
        for document in docs:
            content = str(document.get("content") or "")
            period = group_key(document, group_by)
            periods.append(period)
            for target_pattern in target_patterns:
                for match in target_pattern.finditer(content):
                    context = content[max(0, match.start() - window) : match.end() + window]
                    for word, score, lexicon_pattern in lexicon_patterns:
                        if lexicon_pattern.search(context):
                            totals[target_name][period] += score
                            hit_counts[target_name][period] += 1
                            hits[target_name][period].append({"word": word, "score": score, "context": context})

    ordered = ordered_periods(periods)
    scores = {
        target: {
            period: (totals[target][period] / hit_counts[target][period] if hit_counts[target][period] else 0.0)
            for period in ordered
        }
        for target in targets
    }

    return {
        "months": ordered,
        "targets": list(targets.keys()),
        "scores": scores,
        "hits": {target: dict(periods_map) for target, periods_map in hits.items()},
        "lexicon_source": lexicon_source,
        "lexicon_size": len(lexicon),
    }
