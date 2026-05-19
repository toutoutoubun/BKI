from __future__ import annotations

from collections import defaultdict
from typing import Any

from .common import documents, group_key, sentence_split, tokenize
from .lang_loader import get_language_config, tokenizer_source


def _stats_for_document(document: dict[str, Any], language: str | None) -> dict[str, Any]:
    content = str(document.get("content") or "")
    metadata = document.get("metadata") or {}
    tokens = tokenize(content, language=language)
    sentences = sentence_split(content)
    token_count = len(tokens)
    type_count = len(set(tokens))
    avg_sentence_len = token_count / len(sentences) if sentences else 0.0
    avg_word_len = sum(len(token) for token in tokens) / token_count if token_count else 0.0
    return {
        "document_id": document.get("id"),
        "date": metadata.get("date"),
        "token_count": token_count,
        "type_count": type_count,
        "ttr": round(type_count / token_count, 6) if token_count else 0.0,
        "avg_sentence_len": round(avg_sentence_len, 3),
        "avg_word_len": round(avg_word_len, 3),
    }


def run(payload: dict[str, Any]) -> dict[str, Any]:
    docs = documents(payload)
    language = payload.get("language") or "en"
    lang_config = get_language_config(language)
    per_document = [_stats_for_document(document, language) for document in docs]
    grouped: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    counts: dict[str, int] = defaultdict(int)

    for document, stats in zip(docs, per_document, strict=False):
        period = group_key(document, "month")
        counts[period] += 1
        for key in ["token_count", "type_count", "ttr", "avg_sentence_len", "avg_word_len"]:
            grouped[period][key] += float(stats[key])

    over_time = {}
    for period, values in grouped.items():
        count = max(1, counts[period])
        over_time[period] = {
            "token_count": int(values["token_count"]),
            "type_count": int(values["type_count"]),
            "ttr": round(values["ttr"] / count, 6),
            "avg_sentence_len": round(values["avg_sentence_len"] / count, 3),
            "avg_word_len": round(values["avg_word_len"] / count, 3),
        }

    return {"per_document": per_document, "over_time": over_time, "tokenizer_source": tokenizer_source(lang_config)}
