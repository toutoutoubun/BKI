from __future__ import annotations

import re
from collections import defaultdict
from typing import Any

from .common import documents, group_key
from .lang_loader import get_language_config, get_ner_pipeline

DEFAULT_ENTITY_TYPES = ["PERSON", "ORG", "GPE", "DATE"]


def _fallback_entities(content: str, entity_types: list[str]) -> list[dict[str, Any]]:
    entities: list[dict[str, Any]] = []
    if "DATE" in entity_types:
        for match in re.finditer(r"\b(?:\d{4}-\d{2}-\d{2}|\d{4}|\d{1,2}/\d{1,2}/\d{2,4})\b", content):
            entities.append({"text": match.group(0), "label": "DATE", "start": match.start(), "end": match.end()})

    capitalized = re.compile(r"\b[A-Z][A-Za-z][A-Za-z'-]*(?:\s+[A-Z][A-Za-z][A-Za-z'-]*){0,2}\b")
    for match in capitalized.finditer(content):
        text = match.group(0)
        if "ORG" in entity_types and (text.isupper() or any(suffix in text for suffix in ["Party", "Council", "University", "Inc"])):
            label = "ORG"
        elif "GPE" in entity_types and any(place_word in text for place_word in ["Town", "City", "Province", "State"]):
            label = "GPE"
        elif "PERSON" in entity_types:
            label = "PERSON"
        elif "ORG" in entity_types:
            label = "ORG"
        elif "GPE" in entity_types:
            label = "GPE"
        else:
            continue
        entities.append({"text": text, "label": label, "start": match.start(), "end": match.end()})
    return sorted(entities, key=lambda item: item["start"])


def run(payload: dict[str, Any]) -> dict[str, Any]:
    docs = documents(payload)
    language = payload.get("language") or "en"
    entity_types = payload.get("entity_types") or DEFAULT_ENTITY_TYPES
    group_by = payload.get("group_by", "month")
    lang_config = get_language_config(language)
    pipeline = get_ner_pipeline(lang_config)

    entities: list[dict[str, Any]] = []
    frequency: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    timeline: dict[str, dict[str, dict[str, int]]] = defaultdict(lambda: defaultdict(lambda: defaultdict(int)))

    for document in docs:
        content = str(document.get("content") or "")
        metadata = document.get("metadata") or {}
        period = group_key(document, group_by)
        extracted = []

        if pipeline and lang_config.get("ner_backend") == "huggingface":
            for item in pipeline(content[:20000]):
                label = item.get("entity_group") or item.get("entity") or "ENTITY"
                extracted.append({"text": item.get("word"), "label": label, "start": int(item.get("start", 0)), "end": int(item.get("end", 0))})
        elif pipeline:
            extracted = [{"text": ent.text, "label": ent.label_, "start": ent.start_char, "end": ent.end_char} for ent in pipeline(content).ents]
        else:
            extracted = _fallback_entities(content, entity_types)

        for entity in extracted:
            if entity_types and entity["label"] not in entity_types:
                continue
            start = int(entity["start"])
            end = int(entity["end"])
            text = str(entity["text"]).strip()
            if not text:
                continue
            row = {
                "document_id": document.get("id"),
                "date": metadata.get("date"),
                "text": text,
                "label": entity["label"],
                "start": start,
                "end": end,
                "context": content[max(0, start - 80) : min(len(content), end + 80)],
            }
            entities.append(row)
            frequency[row["label"]][text] += 1
            timeline[row["label"]][period][text] += 1

    return {
        "entities": entities,
        "frequency": {label: dict(values) for label, values in frequency.items()},
        "timeline": {label: {period: dict(values) for period, values in periods.items()} for label, periods in timeline.items()},
        "fallback": pipeline is None,
    }
