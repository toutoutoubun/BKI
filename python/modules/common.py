from __future__ import annotations

import re
from collections import Counter
from collections.abc import Iterable
from datetime import datetime
from typing import Any


def documents(payload: dict[str, Any]) -> list[dict[str, Any]]:
    return [doc for doc in payload.get("documents", []) if isinstance(doc, dict)]


def group_key(document: dict[str, Any], group_by: str) -> str:
    metadata = document.get("metadata") or {}
    date = str(metadata.get("date") or "")

    if group_by == "month":
        return date[:7] if len(date) >= 7 else "unknown"
    if group_by == "year":
        return date[:4] if len(date) >= 4 else "unknown"
    if group_by == "category":
        return str(metadata.get("category") or "uncategorized")
    return str(document.get("filename") or document.get("id") or "document")


def ordered_periods(keys: Iterable[str]) -> list[str]:
    def sort_key(value: str) -> tuple[int, str]:
        if value == "unknown":
            return (1, value)
        try:
            datetime.fromisoformat(value if len(value) > 7 else f"{value}-01")
            return (0, value)
        except ValueError:
            return (0, value)

    return sorted(set(keys), key=sort_key)


def compile_terms(terms: Iterable[str]) -> list[re.Pattern[str]]:
    patterns: list[re.Pattern[str]] = []
    for term in terms:
        if not term:
            continue
        patterns.append(re.compile(re.escape(str(term)), flags=re.IGNORECASE | re.UNICODE))
    return patterns


def _default_tokens(text: str) -> list[str]:
    return re.findall(r"[\w'-]+", text, flags=re.UNICODE)


def tokenize(text: str, lowercase: bool = True, language: str | None = None) -> list[str]:
    tokens: list[str]
    if language:
        try:
            from .lang_loader import get_language_config, get_tokenizer

            tokens = get_tokenizer(get_language_config(language))(text)
        except Exception:  # noqa: BLE001 - tokenizer add-ons must not break analysis fallbacks.
            tokens = _default_tokens(text)
    else:
        tokens = _default_tokens(text)

    tokens = [str(token).strip() for token in tokens if str(token).strip() and re.search(r"\w", str(token), flags=re.UNICODE)]
    if lowercase:
        return [token.casefold() for token in tokens]
    return tokens


def sentence_split(text: str) -> list[str]:
    sentences = re.split(r"(?<=[。.!?！？])\s+", text.strip())
    return [sentence for sentence in sentences if sentence]


def top_counter(counter: Counter[str], limit: int = 20) -> list[dict[str, int | str]]:
    return [{"word": word, "count": count} for word, count in counter.most_common(limit)]
