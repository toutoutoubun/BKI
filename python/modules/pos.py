from __future__ import annotations

from collections import Counter, defaultdict
from typing import Any

from .common import documents, group_key, tokenize, top_counter
from .lang_loader import get_language_config, get_ner_pipeline

DEFAULT_POS_TAGS = ["NOUN", "VERB", "ADJ", "ADV"]


def _guess_pos(token: str) -> str:
    lower = token.casefold()
    if lower.endswith(("ing", "ed", "ize", "ise")):
        return "VERB"
    if lower.endswith(("ly",)):
        return "ADV"
    if lower.endswith(("ous", "ive", "al", "ful", "less", "able", "ible")):
        return "ADJ"
    return "NOUN"


def run(payload: dict[str, Any]) -> dict[str, Any]:
    docs = documents(payload)
    language = payload.get("language") or "en"
    group_by = payload.get("group_by", "month")
    pos_tags = payload.get("pos_tags") or DEFAULT_POS_TAGS
    lang_config = get_language_config(language)
    pipeline = get_ner_pipeline({**lang_config, "ner_model": lang_config.get("pos_model")})

    distribution: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    top_words: dict[str, Counter[str]] = defaultdict(Counter)

    for document in docs:
        content = str(document.get("content") or "")
        period = group_key(document, group_by)
        if pipeline:
            for token in pipeline(content):
                tag = token.pos_
                if tag in pos_tags:
                    distribution[period][tag] += 1
                    top_words[tag][token.text.casefold()] += 1
        else:
            for token in tokenize(content, language=language):
                tag = _guess_pos(token)
                if tag in pos_tags:
                    distribution[period][tag] += 1
                    top_words[tag][token] += 1

    return {
        "distribution": {period: dict(values) for period, values in distribution.items()},
        "top_words": {tag: top_counter(counter) for tag, counter in top_words.items()},
        "fallback": pipeline is None,
    }
