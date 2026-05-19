from __future__ import annotations

import math
from collections import Counter
from typing import Any

from .common import documents, tokenize
from .lang_loader import get_language_config, tokenizer_source


def _tokenize(content: str, language: str | None) -> list[str]:
    return [token for token in tokenize(content, language=language) if len(token) > 1]


def _fallback_tfidf(docs: list[dict[str, Any]], top_n: int, language: str | None) -> list[dict[str, Any]]:
    tokenized = [_tokenize(str(doc.get("content") or ""), language) for doc in docs]
    document_frequency: Counter[str] = Counter()
    for tokens in tokenized:
        document_frequency.update(set(tokens))

    rows = []
    total_docs = max(1, len(docs))
    for document, tokens in zip(docs, tokenized, strict=False):
        counts = Counter(tokens)
        total_terms = max(1, sum(counts.values()))
        scored = []
        for token, count in counts.items():
            tf = count / total_terms
            idf = math.log((1 + total_docs) / (1 + document_frequency[token])) + 1
            scored.append({"term": token, "score": round(tf * idf, 6)})
        rows.append(
            {
                "document_id": document.get("id"),
                "document_name": document.get("filename"),
                "terms": sorted(scored, key=lambda item: item["score"], reverse=True)[:top_n],
            }
        )
    return rows


def run(payload: dict[str, Any]) -> dict[str, Any]:
    docs = documents(payload)
    top_n = int(payload.get("top_n") or 20)
    language = payload.get("language") or "en"
    lang_config = get_language_config(language)
    texts = [str(doc.get("content") or "") for doc in docs]
    tokenizer = lambda text: _tokenize(text, language)

    try:
        from sklearn.feature_extraction.text import TfidfVectorizer

        vectorizer = TfidfVectorizer(
            max_features=int(payload.get("max_features") or 5000),
            tokenizer=tokenizer,
            token_pattern=None,
            lowercase=False,
        )
        matrix = vectorizer.fit_transform(texts)
        terms = vectorizer.get_feature_names_out()
        results = []
        for index, document in enumerate(docs):
            row = matrix[index].toarray()[0]
            pairs = sorted(((terms[i], row[i]) for i in row.nonzero()[0]), key=lambda item: item[1], reverse=True)
            results.append(
                {
                    "document_id": document.get("id"),
                    "document_name": document.get("filename"),
                    "terms": [{"term": term, "score": round(float(score), 6)} for term, score in pairs[:top_n]],
                }
            )
        return {"results": results, "tokenizer_source": tokenizer_source(lang_config)}
    except Exception:  # noqa: BLE001
        return {"results": _fallback_tfidf(docs, top_n, language), "fallback": True, "tokenizer_source": tokenizer_source(lang_config)}
