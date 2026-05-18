from __future__ import annotations

from collections import Counter, defaultdict
from typing import Any

from .common import documents, group_key, tokenize


def _fallback_topics(docs: list[dict[str, Any]], n_topics: int, n_words: int, group_by: str) -> dict[str, Any]:
    all_tokens: Counter[str] = Counter()
    doc_tokens: list[Counter[str]] = []
    for document in docs:
        counter = Counter(tokenize(str(document.get("content") or "")))
        doc_tokens.append(counter)
        all_tokens.update(counter)

    seeds = [word for word, _ in all_tokens.most_common(max(n_topics * n_words, n_topics))]
    topics = []
    for topic_id in range(n_topics):
        words = seeds[topic_id::n_topics][:n_words]
        topics.append(
            {
                "id": topic_id,
                "top_words": [{"word": word, "weight": round(all_tokens[word] / max(1, all_tokens.total()), 6)} for word in words],
                "label": "",
            }
        )

    matrix = []
    over_time: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    topic_word_sets = [set(item["word"] for item in topic["top_words"]) for topic in topics]
    for document, counter in zip(docs, doc_tokens, strict=False):
        weights = []
        total = max(1, sum(counter.values()))
        period = group_key(document, group_by)
        for topic_id, words in enumerate(topic_word_sets):
            weight = sum(counter[word] for word in words) / total
            weights.append(round(weight, 6))
            over_time[str(topic_id)][period] += weight
        matrix.append({"document_id": document.get("id"), "topic_weights": weights})

    return {
        "topics": topics,
        "doc_topic_matrix": matrix,
        "topic_over_time": {topic: dict(periods) for topic, periods in over_time.items()},
        "fallback": True,
    }


def run(payload: dict[str, Any]) -> dict[str, Any]:
    docs = documents(payload)
    method = payload.get("method", "nmf")
    n_topics = int(payload.get("n_topics") or 5)
    n_words = int(payload.get("n_words") or 10)
    group_by = payload.get("metadata_field") or "month"
    texts = [str(document.get("content") or "") for document in docs]

    try:
        from sklearn.decomposition import LatentDirichletAllocation, NMF
        from sklearn.feature_extraction.text import TfidfVectorizer

        vectorizer = TfidfVectorizer(max_features=3000, stop_words="english")
        matrix = vectorizer.fit_transform(texts)
        model = LatentDirichletAllocation(n_components=n_topics, random_state=42) if method == "lda" else NMF(n_components=n_topics, random_state=42)
        doc_topic = model.fit_transform(matrix)
        terms = vectorizer.get_feature_names_out()

        topics = []
        for topic_id, weights in enumerate(model.components_):
            indexes = weights.argsort()[::-1][:n_words]
            topics.append(
                {
                    "id": int(topic_id),
                    "top_words": [{"word": terms[index], "weight": round(float(weights[index]), 6)} for index in indexes],
                    "label": "",
                }
            )

        doc_topic_matrix = [
            {"document_id": docs[index].get("id"), "topic_weights": [round(float(weight), 6) for weight in row]}
            for index, row in enumerate(doc_topic)
        ]
        return {"topics": topics, "doc_topic_matrix": doc_topic_matrix, "topic_over_time": {}, "method": method}
    except Exception:  # noqa: BLE001
        return _fallback_topics(docs, n_topics, n_words, group_by)

