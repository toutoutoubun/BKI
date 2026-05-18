from __future__ import annotations

from typing import Any

from .lang_loader import load_installed_languages

BUILTIN_CREDITS: list[dict[str, str]] = [
    {"name": "spaCy", "authors": "Explosion AI", "url": "https://spacy.io", "license": "MIT", "license_type": "open"},
    {"name": "NLTK", "authors": "NLTK Project", "url": "https://nltk.org", "license": "Apache 2.0", "license_type": "open"},
    {"name": "scikit-learn", "authors": "scikit-learn developers", "url": "https://scikit-learn.org", "license": "BSD 3-Clause", "license_type": "open"},
    {"name": "Gensim", "authors": "RARE Technologies", "url": "https://radimrehurek.com/gensim", "license": "LGPL 2.1", "license_type": "open"},
    {"name": "Transformers", "authors": "Hugging Face", "url": "https://huggingface.co/transformers", "license": "Apache 2.0", "license_type": "open"},
    {"name": "MasakhaNER", "authors": "Masakhane NLP", "url": "https://huggingface.co/masakhane", "license": "CC-BY-4.0-NC", "license_type": "nc", "note": "Check the exact model license before commercial use."},
]


def collect_all_credits() -> list[dict[str, Any]]:
    credits: list[dict[str, Any]] = [dict(item) for item in BUILTIN_CREDITS]
    for config in load_installed_languages().values():
        credits.extend(config.get("credits", []))

    seen: set[tuple[str, str]] = set()
    unique = []
    for credit in credits:
        key = (str(credit.get("name")), str(credit.get("url")))
        if key in seen:
            continue
        seen.add(key)
        unique.append(credit)
    return unique


def run(payload: dict[str, Any] | None = None) -> dict[str, Any]:
    del payload
    return {"credits": collect_all_credits()}

