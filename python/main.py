import json
import sys
import traceback

from modules import (
    cooccurrence,
    credits,
    dependency,
    export,
    frequency,
    ingest,
    kwic,
    lexical_stats,
    ner,
    pos,
    sentiment,
    similarity,
    tfidf,
    topic_model,
)
from modules.lang_loader import get_languages

DISPATCH = {
    "ingest": ingest.run,
    "frequency": frequency.run,
    "kwic": kwic.run,
    "sentiment": sentiment.run,
    "cooccurrence": cooccurrence.run,
    "tfidf": tfidf.run,
    "export": export.run,
    "ner": ner.run,
    "topic_model": topic_model.run,
    "similarity": similarity.run,
    "pos": pos.run,
    "dependency": dependency.run,
    "lexical_stats": lexical_stats.run,
    "get_languages": get_languages,
    "get_credits": credits.run,
}


def handle(request: dict) -> dict:
    command = request.get("command")
    payload = request.get("payload", {})
    if command in DISPATCH:
        return DISPATCH[command](payload)
    return {"error": f"unknown command: {command}"}


def main() -> None:
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            request = json.loads(line)
            response = handle(request)
        except Exception as exc:  # noqa: BLE001 - sidecar must report structured errors.
            response = {
                "error": str(exc),
                "traceback": traceback.format_exc(limit=8),
            }

        print(json.dumps(response, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
