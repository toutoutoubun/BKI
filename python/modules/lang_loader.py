from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Callable

ADDONS_DIR = Path.home() / "Documents" / "BKI" / "addons"

BUILTIN_LANGUAGES: dict[str, dict[str, Any]] = {
    "en": {
        "code": "en",
        "name": "English",
        "tokenizer": "nltk",
        "ner_model": "en_core_web_sm",
        "pos_model": "en_core_web_sm",
        "built_in": True,
        "capabilities": [
            "frequency",
            "kwic",
            "sentiment",
            "cooccurrence",
            "tfidf",
            "topic_model",
            "similarity",
            "lexical_stats",
            "ner",
            "pos",
            "dependency",
        ],
        "credits": [
            {"name": "spaCy en_core_web_sm", "authors": "Explosion AI", "url": "https://spacy.io", "license": "MIT", "license_type": "open"}
        ],
    },
    "ja": {
        "code": "ja",
        "name": "Japanese (日本語)",
        "tokenizer": "sudachi",
        "ner_model": "ja_ginza",
        "pos_model": "ja_ginza",
        "built_in": True,
        "capabilities": ["frequency", "kwic", "sentiment", "cooccurrence", "tfidf", "topic_model", "similarity", "lexical_stats", "ner", "pos"],
        "credits": [
            {"name": "GiNZA", "authors": "Megagon Labs", "url": "https://megagonlabs.github.io/ginza/", "license": "Apache 2.0", "license_type": "open"},
            {"name": "SudachiDict", "authors": "Works Applications", "url": "https://github.com/WorksApplications/SudachiDict", "license": "Apache 2.0", "license_type": "open"},
        ],
    },
    "fr": {
        "code": "fr",
        "name": "French (Français)",
        "tokenizer": "spacy",
        "ner_model": "fr_core_news_sm",
        "pos_model": "fr_core_news_sm",
        "built_in": True,
        "capabilities": [
            "frequency",
            "kwic",
            "sentiment",
            "cooccurrence",
            "tfidf",
            "topic_model",
            "similarity",
            "lexical_stats",
            "ner",
            "pos",
            "dependency",
        ],
        "credits": [
            {"name": "spaCy fr_core_news_sm", "authors": "Explosion AI", "url": "https://spacy.io", "license": "MIT", "license_type": "open"}
        ],
    },
    "af": {
        "code": "af",
        "name": "Afrikaans",
        "tokenizer": "whitespace",
        "ner_model": "xx_ent_wiki_sm",
        "pos_model": "xx_ent_wiki_sm",
        "built_in": True,
        "capabilities": ["frequency", "kwic", "sentiment", "cooccurrence", "tfidf", "topic_model", "similarity", "lexical_stats", "ner", "pos"],
        "credits": [
            {"name": "spaCy xx_ent_wiki_sm", "authors": "Explosion AI", "url": "https://spacy.io", "license": "MIT", "license_type": "open"}
        ],
    },
}


def _capabilities(config: dict[str, Any]) -> list[str]:
    fallback = config.get("fallback") or {}
    capabilities = ["frequency", "kwic", "sentiment", "cooccurrence", "tfidf", "topic_model", "similarity", "lexical_stats"]
    if config.get("ner_model") or fallback.get("ner"):
        capabilities.append("ner")
    if config.get("pos_model") or fallback.get("pos"):
        capabilities.append("pos")
    if config.get("pos_model") and config.get("ner_model"):
        capabilities.append("dependency")
    return capabilities


def load_installed_languages() -> dict[str, dict[str, Any]]:
    langs = {code: dict(config) for code, config in BUILTIN_LANGUAGES.items()}
    if not ADDONS_DIR.exists():
        return langs

    for addon_dir in ADDONS_DIR.iterdir():
        manifest_path = addon_dir / "manifest.json"
        if not manifest_path.exists():
            continue
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        if manifest.get("type") != "language":
            continue

        code = manifest["language_code"]
        provides = manifest.get("provides") or {}
        config = {
            "code": code,
            "name": manifest.get("name", code),
            "tokenizer": provides.get("tokenizer", "whitespace"),
            "ner_model": provides.get("ner_model"),
            "ner_backend": provides.get("ner_backend", "spacy"),
            "pos_model": provides.get("pos_model"),
            "locale": provides.get("locale", code),
            "stopwords_path": str(addon_dir / "stopwords" / f"{code}.txt"),
            "lexicon_path": str(addon_dir / "lexicon" / f"{code}.tsv"),
            "fallback": manifest.get("fallback", {}),
            "credits": manifest.get("credits", []),
            "built_in": False,
            "addon_path": str(addon_dir),
        }
        config["capabilities"] = _capabilities(config)
        langs[code] = config

    return langs


def get_languages(payload: dict[str, Any] | None = None) -> dict[str, Any]:
    del payload
    languages = []
    for code, config in sorted(load_installed_languages().items()):
        languages.append(
            {
                "code": code,
                "name": config.get("name", code),
                "built_in": bool(config.get("built_in")),
                "capabilities": config.get("capabilities") or _capabilities(config),
                "license_warnings": [
                    credit
                    for credit in config.get("credits", [])
                    if credit.get("license_type") in {"nc", "unknown"}
                ],
            }
        )
    return {"languages": languages, "addons_dir": str(ADDONS_DIR)}


def get_language_config(language: str | None) -> dict[str, Any]:
    langs = load_installed_languages()
    return langs.get(language or "en") or langs["en"]


def get_tokenizer(lang_config: dict[str, Any]) -> Callable[[str], list[str]]:
    tokenizer_name = lang_config.get("tokenizer", "whitespace")
    if tokenizer_name == "sudachi":
        try:
            import sudachipy

            tokenizer = sudachipy.Dictionary().create()
            return lambda text: [m.surface() for m in tokenizer.tokenize(text)]
        except Exception:  # noqa: BLE001
            return lambda text: text.split()
    if tokenizer_name == "nltk":
        try:
            import nltk

            return nltk.word_tokenize
        except Exception:  # noqa: BLE001
            return lambda text: text.split()
    return lambda text: text.split()


def get_ner_pipeline(lang_config: dict[str, Any]):
    ner_model = lang_config.get("ner_model")
    backend = lang_config.get("ner_backend", "spacy")
    if not ner_model:
        return None
    try:
        if backend == "spacy":
            import spacy

            return spacy.load(ner_model)
        if backend == "huggingface":
            from transformers import pipeline

            return pipeline("ner", model=ner_model, aggregation_strategy="simple")
    except Exception:  # noqa: BLE001
        return None
    return None
