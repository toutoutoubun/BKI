from __future__ import annotations

from collections import Counter, defaultdict
from typing import Any

from .common import documents, group_key, tokenize
from .lang_loader import get_language_config, tokenizer_source


def _topic_over_time(docs: list[dict[str, Any]], doc_topic: list[list[float]], group_by: str) -> dict[str, dict[str, float]]:
    totals: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    counts: dict[str, int] = defaultdict(int)

    for document, weights in zip(docs, doc_topic, strict=False):
        period = group_key(document, group_by)
        counts[period] += 1
        for topic_id, weight in enumerate(weights):
            totals[str(topic_id)][period] += float(weight)

    return {
        topic_id: {
            period: round(total / max(1, counts[period]), 6)
            for period, total in sorted(periods.items())
        }
        for topic_id, periods in totals.items()
    }


def _fallback_topics(docs: list[dict[str, Any]], n_topics: int, n_words: int, group_by: str, language: str | None) -> dict[str, Any]:
    all_tokens: Counter[str] = Counter()
    doc_tokens: list[Counter[str]] = []
    for document in docs:
        counter = Counter(tokenize(str(document.get("content") or ""), language=language))
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
    topic_word_sets = [set(item["word"] for item in topic["top_words"]) for topic in topics]
    for document, counter in zip(docs, doc_tokens, strict=False):
        weights = []
        total = max(1, sum(counter.values()))
        for topic_id, words in enumerate(topic_word_sets):
            weight = sum(counter[word] for word in words) / total
            weights.append(round(weight, 6))
        matrix.append({"document_id": document.get("id"), "topic_weights": weights})

    return {
        "topics": topics,
        "doc_topic_matrix": matrix,
        "topic_over_time": _topic_over_time(docs, [row["topic_weights"] for row in matrix], group_by),
        "fallback": True,
    }


def run(payload: dict[str, Any]) -> dict[str, Any]:
    docs = documents(payload)
    language = payload.get("language") or "en"
    lang_config = get_language_config(language)
    method = payload.get("method", "nmf")
    n_topics = int(payload.get("n_topics") or 5)
    n_words = int(payload.get("n_words") or 10)
    group_by = payload.get("metadata_field") or "month"
    texts = [str(document.get("content") or "") for document in docs]

    try:
        from sklearn.decomposition import LatentDirichletAllocation, NMF
        from sklearn.feature_extraction.text import TfidfVectorizer

        vectorizer = TfidfVectorizer(
            max_features=3000,
            stop_words="english" if language == "en" else None,
            tokenizer=lambda text: tokenize(text, language=language),
            token_pattern=None,
            lowercase=False,
        )
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
        topic_over_time = _topic_over_time(docs, [row["topic_weights"] for row in doc_topic_matrix], group_by)
        return {
            "topics": topics,
            "doc_topic_matrix": doc_topic_matrix,
            "topic_over_time": topic_over_time,
            "method": method,
            "tokenizer_source": tokenizer_source(lang_config),
        }
    except Exception:  # noqa: BLE001
        result = _fallback_topics(docs, n_topics, n_words, group_by, language)
        result["tokenizer_source"] = tokenizer_source(lang_config)
        return result
