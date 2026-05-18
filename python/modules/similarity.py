from __future__ import annotations

import math
from collections import Counter
from typing import Any

from .common import documents, tokenize


def _cosine(left: Counter[str], right: Counter[str]) -> float:
    shared = set(left) & set(right)
    numerator = sum(left[token] * right[token] for token in shared)
    left_norm = math.sqrt(sum(value * value for value in left.values()))
    right_norm = math.sqrt(sum(value * value for value in right.values()))
    if not left_norm or not right_norm:
        return 0.0
    return numerator / (left_norm * right_norm)


def _fallback(docs: list[dict[str, Any]], query_document_id: str | None, n_clusters: int) -> dict[str, Any]:
    counters = [Counter(tokenize(str(document.get("content") or ""))) for document in docs]
    matrix = [[round(_cosine(left, right), 6) for right in counters] for left in counters]
    ranked = []
    if query_document_id:
        query_index = next((index for index, document in enumerate(docs) if document.get("id") == query_document_id), None)
        if query_index is not None:
            ranked = [
                {"document_id": docs[index].get("id"), "score": matrix[query_index][index]}
                for index in range(len(docs))
                if index != query_index
            ]
            ranked.sort(key=lambda item: item["score"], reverse=True)
    clusters: dict[str, list[Any]] = {str(index): [] for index in range(max(1, n_clusters))}
    for index, document in enumerate(docs):
        clusters[str(index % max(1, n_clusters))].append(document.get("id"))
    return {"similarity_matrix": matrix, "ranked": ranked, "clusters": clusters, "fallback": True}


def run(payload: dict[str, Any]) -> dict[str, Any]:
    docs = documents(payload)
    query_document_id = payload.get("query_document_id")
    n_clusters = int(payload.get("n_clusters") or 3)
    texts = [str(document.get("content") or "") for document in docs]

    try:
        from sklearn.cluster import KMeans
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.metrics.pairwise import cosine_similarity

        vectorizer = TfidfVectorizer(max_features=5000)
        matrix = vectorizer.fit_transform(texts)
        similarity_matrix = cosine_similarity(matrix).round(6).tolist()
        ranked = []
        if query_document_id:
            query_index = next((index for index, document in enumerate(docs) if document.get("id") == query_document_id), None)
            if query_index is not None:
                ranked = [
                    {"document_id": docs[index].get("id"), "score": similarity_matrix[query_index][index]}
                    for index in range(len(docs))
                    if index != query_index
                ]
                ranked.sort(key=lambda item: item["score"], reverse=True)
        cluster_count = min(max(1, n_clusters), max(1, len(docs)))
        labels = KMeans(n_clusters=cluster_count, random_state=42, n_init="auto").fit_predict(matrix) if docs else []
        clusters: dict[str, list[Any]] = {}
        for label, document in zip(labels, docs, strict=False):
            clusters.setdefault(str(int(label)), []).append(document.get("id"))
        return {"similarity_matrix": similarity_matrix, "ranked": ranked, "clusters": clusters}
    except Exception:  # noqa: BLE001
        return _fallback(docs, query_document_id, n_clusters)

