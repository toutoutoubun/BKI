from __future__ import annotations

import re
import unicodedata
from typing import Any

LATIN_STOPWORDS: dict[str, set[str]] = {
    "en": {
        "a",
        "an",
        "and",
        "are",
        "as",
        "at",
        "be",
        "by",
        "for",
        "from",
        "has",
        "he",
        "in",
        "is",
        "it",
        "its",
        "of",
        "on",
        "that",
        "the",
        "to",
        "was",
        "were",
        "will",
        "with",
    },
    "fr": {
        "au",
        "aux",
        "avec",
        "ce",
        "ces",
        "dans",
        "de",
        "des",
        "du",
        "elle",
        "en",
        "est",
        "et",
        "il",
        "la",
        "le",
        "les",
        "pour",
        "que",
        "qui",
        "sur",
        "un",
        "une",
    },
    "af": {
        "'n",
        "aan",
        "as",
        "by",
        "dat",
        "die",
        "dit",
        "en",
        "het",
        "hy",
        "in",
        "is",
        "met",
        "nie",
        "op",
        "te",
        "van",
        "vir",
        "was",
    },
}

WORD_RE = re.compile(r"\b[\w'-]+\b", flags=re.UNICODE)
SPACE_RE = re.compile(r"[ \t]+")
BLANK_LINE_RE = re.compile(r"\n{3,}")


def _normalize(content: str) -> str:
    normalized = unicodedata.normalize("NFKC", content)
    normalized = normalized.replace("\r\n", "\n").replace("\r", "\n")
    normalized = SPACE_RE.sub(" ", normalized)
    return BLANK_LINE_RE.sub("\n\n", normalized).strip()


def _clean_punctuation(content: str) -> str:
    replacements = {
        "“": '"',
        "”": '"',
        "‘": "'",
        "’": "'",
        "—": "-",
        "–": "-",
        "…": "...",
    }
    for source, target in replacements.items():
        content = content.replace(source, target)
    content = re.sub(r"([,.;:])\1+", r"\1", content)
    content = re.sub(r"([!?])\1{2,}", r"\1\1", content)
    content = re.sub(r"\s+([,.;:!?])", r"\1", content)
    content = re.sub(r"([,.;:!?])([^\s\n])", r"\1 \2", content)
    return content


def _remove_stopwords(content: str, language: str) -> tuple[str, int]:
    stopwords = LATIN_STOPWORDS.get(language, LATIN_STOPWORDS["en"])
    removed = 0

    def replace(match: re.Match[str]) -> str:
        nonlocal removed
        token = match.group(0)
        if token.lower() in stopwords:
            removed += 1
            return ""
        return token

    cleaned = WORD_RE.sub(replace, content)
    cleaned = SPACE_RE.sub(" ", cleaned)
    cleaned = re.sub(r" +\n", "\n", cleaned)
    return cleaned.strip(), removed


def _stem_token(token: str) -> str:
    lower = token.lower()
    for suffix in ("ization", "ational", "fulness", "ousness", "iveness", "ingly", "edly", "ing", "ed", "es", "s"):
        if lower.endswith(suffix) and len(token) > len(suffix) + 3:
            return token[: -len(suffix)]
    return token


def _stem(content: str, language: str) -> tuple[str, int, bool]:
    if language == "ja":
        return content, 0, True

    try:
        from nltk.stem import SnowballStemmer

        stemmer_language = "french" if language == "fr" else "english"
        stemmer = SnowballStemmer(stemmer_language)
        fallback = False
    except Exception:  # noqa: BLE001 - preprocessing must work without optional models.
        stemmer = None
        fallback = True

    changed = 0

    def replace(match: re.Match[str]) -> str:
        nonlocal changed
        token = match.group(0)
        stemmed = stemmer.stem(token) if stemmer else _stem_token(token)
        if stemmed != token:
            changed += 1
        return stemmed

    return WORD_RE.sub(replace, content), changed, fallback


def _process_document(document: dict[str, Any], options: dict[str, bool]) -> tuple[dict[str, Any], dict[str, Any]]:
    metadata = document.get("metadata") or {}
    language = metadata.get("language") or "en"
    original = str(document.get("content") or "")
    content = original
    removed_stopwords = 0
    stemmed_terms = 0
    stemming_fallback = False

    if options.get("normalize"):
        content = _normalize(content)
    if options.get("lowercase"):
        content = content.lower()
    if options.get("stopwords"):
        content, removed_stopwords = _remove_stopwords(content, language)
    if options.get("stemming"):
        content, stemmed_terms, stemming_fallback = _stem(content, language)
    if options.get("punctuation"):
        content = _clean_punctuation(content)

    processed = {
        **document,
        "content": content,
        "metadata": metadata,
    }
    stats = {
        "document_id": document.get("id"),
        "filename": document.get("filename"),
        "language": language,
        "original_characters": len(original),
        "processed_characters": len(content),
        "changed": content != original,
        "removed_stopwords": removed_stopwords,
        "stemmed_terms": stemmed_terms,
        "stemming_fallback": stemming_fallback,
    }
    return processed, stats


def run(payload: dict[str, Any]) -> dict[str, Any]:
    options = {
        "normalize": bool(payload.get("options", {}).get("normalize", True)),
        "lowercase": bool(payload.get("options", {}).get("lowercase", False)),
        "punctuation": bool(payload.get("options", {}).get("punctuation", True)),
        "stopwords": bool(payload.get("options", {}).get("stopwords", False)),
        "stemming": bool(payload.get("options", {}).get("stemming", False)),
    }
    processed_documents = []
    per_document = []

    for document in payload.get("documents", []):
        processed, stats = _process_document(document, options)
        processed_documents.append(processed)
        per_document.append(stats)

    original_characters = sum(item["original_characters"] for item in per_document)
    processed_characters = sum(item["processed_characters"] for item in per_document)
    removed_stopwords = sum(item["removed_stopwords"] for item in per_document)
    stemmed_terms = sum(item["stemmed_terms"] for item in per_document)

    return {
        "documents": processed_documents,
        "stats": {
            "document_count": len(processed_documents),
            "changed_documents": sum(1 for item in per_document if item["changed"]),
            "original_characters": original_characters,
            "processed_characters": processed_characters,
            "character_delta": processed_characters - original_characters,
            "removed_stopwords": removed_stopwords,
            "stemmed_terms": stemmed_terms,
            "stemming_fallback": any(item["stemming_fallback"] for item in per_document),
            "per_document": per_document,
            "options": options,
        },
    }
