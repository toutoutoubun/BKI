from __future__ import annotations

import json
import re
import importlib.util
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
        "lexicon": [
            {"word": "good", "score": 1},
            {"word": "strong", "score": 1},
            {"word": "support", "score": 1},
            {"word": "bad", "score": -1},
            {"word": "weak", "score": -1},
            {"word": "risk", "score": -1},
        ],
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
        "lexicon": [
            {"word": "良い", "score": 1},
            {"word": "支持", "score": 1},
            {"word": "強い", "score": 1},
            {"word": "悪い", "score": -1},
            {"word": "弱い", "score": -1},
            {"word": "リスク", "score": -1},
        ],
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
        "lexicon": [
            {"word": "bon", "score": 1},
            {"word": "fort", "score": 1},
            {"word": "soutien", "score": 1},
            {"word": "mauvais", "score": -1},
            {"word": "faible", "score": -1},
            {"word": "risque", "score": -1},
        ],
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
        "lexicon": [
            {"word": "goed", "score": 1},
            {"word": "sterk", "score": 1},
            {"word": "steun", "score": 1},
            {"word": "sleg", "score": -1},
            {"word": "swak", "score": -1},
            {"word": "risiko", "score": -1},
        ],
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
            "tokenizer_rules_path": str(addon_dir / "tokenizer" / "rules.json"),
            "stopwords_path": str(addon_dir / "stopwords" / f"{code}.txt"),
            "lexicon_path": str(addon_dir / "lexicon" / f"{code}.tsv"),
            "fallback": manifest.get("fallback", {}),
            "credits": manifest.get("credits", []),
            "id": manifest.get("id", addon_dir.name),
            "version": manifest.get("version"),
            "author": manifest.get("author"),
            "bki_min_version": manifest.get("bki_min_version"),
            "pip_requires": manifest.get("pip_requires", []),
            "spacy_models": manifest.get("spacy_models", []),
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
                "tokenizer": config.get("tokenizer", "whitespace"),
                "tokenizer_source": tokenizer_source(config),
                "version": config.get("version"),
                "author": config.get("author"),
                "addon_path": config.get("addon_path"),
                "requirements": {
                    "pip": config.get("pip_requires", []),
                    "spacy_models": config.get("spacy_models", []),
                },
                "missing_requirements": missing_requirements(config),
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


def load_stopwords(language: str | None) -> set[str]:
    lang_config = get_language_config(language)
    stopwords_path = lang_config.get("stopwords_path")
    if not stopwords_path:
        return set()

    path = Path(str(stopwords_path)).expanduser()
    if not path.exists():
        return set()

    stopwords: set[str] = set()
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        stopwords.add(stripped.casefold())
    return stopwords


def _regex_tokenizer(lang_config: dict[str, Any]) -> Callable[[str], list[str]] | None:
    rules_path = lang_config.get("tokenizer_rules_path")
    if not rules_path:
        return None

    path = Path(str(rules_path)).expanduser()
    if not path.exists():
        return None

    try:
        rules = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(rules, dict):
            return None
        if rules.get("type") != "regex" or not rules.get("pattern"):
            return None
        pattern = re.compile(str(rules["pattern"]), flags=re.UNICODE)
    except (OSError, json.JSONDecodeError, re.error):
        return None

    lowercase = bool(rules.get("lowercase", True))
    try:
        min_length = max(1, int(rules.get("min_length") or 1))
    except (TypeError, ValueError):
        min_length = 1
    group = rules.get("group")

    def tokenize(text: str) -> list[str]:
        tokens: list[str] = []
        for match in pattern.finditer(text):
            try:
                value = match.group(group) if group is not None else match.group(0)
            except IndexError:
                value = match.group(0)
            token = str(value).strip()
            if len(token) < min_length:
                continue
            tokens.append(token.casefold() if lowercase else token)
        return tokens

    return tokenize


def tokenizer_source(lang_config: dict[str, Any]) -> str:
    rules_path = lang_config.get("tokenizer_rules_path")
    if rules_path and Path(str(rules_path)).expanduser().exists():
        return "language_addon_rules"
    return str(lang_config.get("tokenizer", "whitespace"))


def _requirement_module_name(requirement: str) -> str:
    name = re.split(r"[<>=!~;\\[]", requirement, maxsplit=1)[0].strip()
    aliases = {
        "python-docx": "docx",
        "pdfminer.six": "pdfminer",
        "scikit-learn": "sklearn",
        "spacy-transformers": "spacy_transformers",
        "sudachidict-core": "sudachidict_core",
    }
    return aliases.get(name, name.replace("-", "_"))


def missing_requirements(lang_config: dict[str, Any]) -> list[dict[str, str]]:
    missing: list[dict[str, str]] = []

    for requirement in lang_config.get("pip_requires") or []:
        if not isinstance(requirement, str) or not requirement.strip():
            continue
        module_name = _requirement_module_name(requirement)
        if importlib.util.find_spec(module_name) is None:
            missing.append(
                {
                    "type": "pip",
                    "name": requirement,
                    "install_hint": f"pip install {requirement}",
                }
            )

    for model in lang_config.get("spacy_models") or []:
        if not isinstance(model, str) or not model.strip():
            continue
        if importlib.util.find_spec(model) is None:
            missing.append(
                {
                    "type": "spacy_model",
                    "name": model,
                    "install_hint": f"python -m spacy download {model}",
                }
            )

    return missing


def get_tokenizer(lang_config: dict[str, Any]) -> Callable[[str], list[str]]:
    custom_tokenizer = _regex_tokenizer(lang_config)
    if custom_tokenizer:
        return custom_tokenizer

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


def load_sentiment_lexicon(language: str | None) -> list[dict[str, float | str]]:
    lang_config = get_language_config(language)
    lexicon_path = lang_config.get("lexicon_path")
    entries: list[dict[str, float | str]] = []

    if lexicon_path:
        path = Path(str(lexicon_path)).expanduser()
        if path.exists():
            for line in path.read_text(encoding="utf-8").splitlines():
                stripped = line.strip()
                if not stripped or stripped.startswith("#"):
                    continue
                cells = [cell.strip() for cell in stripped.split("\t")]
                if len(cells) < 2 or cells[0].casefold() == "word":
                    continue
                try:
                    entries.append({"word": cells[0], "score": float(cells[1])})
                except ValueError:
                    continue

    if entries:
        return entries
    return list(lang_config.get("lexicon") or [])


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
