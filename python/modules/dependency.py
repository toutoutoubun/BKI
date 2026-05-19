from __future__ import annotations

import re
from typing import Any

from .common import documents, sentence_split, tokenize
from .lang_loader import get_language_config, get_ner_pipeline


def _fallback_sentence_triples(document: dict[str, Any], target: str, language: str | None) -> list[dict[str, Any]]:
    metadata = document.get("metadata") or {}
    triples = []
    for sentence in sentence_split(str(document.get("content") or "")):
        if target.casefold() not in sentence.casefold():
            continue
        words = tokenize(sentence, lowercase=False, language=language) or re.findall(r"[\w'-]+", sentence, flags=re.UNICODE)
        target_index = next((index for index, word in enumerate(words) if target.casefold() in word.casefold()), 0)
        subject = words[target_index] if target_index < len(words) else target
        verb = next((word for word in words[target_index + 1 :] if word.casefold().endswith(("ed", "ing", "s"))), "")
        obj = " ".join(words[target_index + 1 : target_index + 5])
        triples.append(
            {
                "document_id": document.get("id"),
                "date": metadata.get("date"),
                "subject": subject,
                "verb": verb,
                "object": obj,
                "sentence": sentence,
            }
        )
    return triples


def run(payload: dict[str, Any]) -> dict[str, Any]:
    docs = documents(payload)
    target = str(payload.get("target_entity") or "").strip()
    language = payload.get("language") or "en"
    lang_config = get_language_config(language)
    pipeline = get_ner_pipeline({**lang_config, "ner_model": lang_config.get("pos_model")})
    triples: list[dict[str, Any]] = []

    if not target:
        return {"triples": [], "fallback": pipeline is None}

    for document in docs:
        metadata = document.get("metadata") or {}
        content = str(document.get("content") or "")
        if pipeline:
            for sentence in pipeline(content).sents:
                if target.casefold() not in sentence.text.casefold():
                    continue
                root = next((token for token in sentence if token.dep_ == "ROOT"), None)
                subject = next((child.text for child in root.children if child.dep_ in {"nsubj", "nsubjpass"}) if root else None, target)
                obj = next((child.text for child in root.children if child.dep_ in {"dobj", "obj", "pobj"}) if root else None, "")
                triples.append(
                    {
                        "document_id": document.get("id"),
                        "date": metadata.get("date"),
                        "subject": subject,
                        "verb": root.text if root else "",
                        "object": obj,
                        "sentence": sentence.text,
                    }
                )
        else:
            triples.extend(_fallback_sentence_triples(document, target, language))

    return {"triples": triples, "fallback": pipeline is None}
