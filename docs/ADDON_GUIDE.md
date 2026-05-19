# BKI 言語アドオン作成ガイド

BKI は言語アドオンで対応言語を拡張できます。spaCy モデルが存在しない言語でも、辞書ベースで頻度、KWIC、センチメント、共起、TF-IDF、トピックモデルを動かせます。

## インストール先

アドオンフォルダを `~/Documents/BKI/addons/` に置き、BKI を再起動します。

```text
~/Documents/BKI/addons/
  bki-lang-zu/
    manifest.json
    locales/zu.json
    stopwords/zu.txt
    lexicon/zu.tsv
```

`locales/<locale>.json` が存在する場合、BKI は起動時にその翻訳を読み込み、画面右上のUI言語メニューへ追加します。未定義キーは通常の i18next フォールバックで日本語に戻ります。

## 最小構成

```json
{
  "id": "bki-lang-zu",
  "name": "Zulu (isiZulu)",
  "version": "1.0.0",
  "type": "language",
  "language_code": "zu",
  "bki_min_version": "0.1.0",
  "provides": {
    "tokenizer": "whitespace",
    "ner_model": null,
    "pos_model": null,
    "locale": "zu"
  },
  "pip_requires": [],
  "spacy_models": [],
  "fallback": {
    "tokenizer": "whitespace",
    "ner": false,
    "pos": false
  }
}
```

## フル構成

```json
{
  "id": "bki-lang-fr",
  "name": "French (Français)",
  "version": "1.0.0",
  "type": "language",
  "language_code": "fr",
  "bki_min_version": "0.1.0",
  "provides": {
    "tokenizer": "spacy",
    "ner_model": "fr_core_news_sm",
    "pos_model": "fr_core_news_sm",
    "locale": "fr"
  },
  "pip_requires": [],
  "spacy_models": ["fr_core_news_sm"],
  "fallback": {
    "tokenizer": "whitespace",
    "ner": false,
    "pos": false
  }
}
```

## カスタムトークナイザー

スペース分割が適切でない言語は `tokenizer/rules.json` に正規表現ルールを置けます。
このルールは TF-IDF、トピックモデル、文書類似度、語彙統計、POS/依存関係のフォールバック処理で使用されます。

```json
{
  "type": "regex",
  "pattern": "[\\w']+",
  "lowercase": true,
  "min_length": 1
}
```

## HuggingFace NER

spaCy 公式モデルが存在しない言語は、`ner_backend: "huggingface"` と HuggingFace モデル名を指定できます。

```json
{
  "id": "bki-lang-zu",
  "name": "Zulu (isiZulu)",
  "version": "1.0.0",
  "type": "language",
  "language_code": "zu",
  "provides": {
    "tokenizer": "whitespace",
    "ner_model": "masakhane/masakhaner2-zul",
    "ner_backend": "huggingface",
    "pos_model": null,
    "locale": "zu"
  },
  "pip_requires": ["transformers", "spacy-transformers"],
  "spacy_models": [],
  "credits": [
    {
      "name": "MasakhaNER 2.0",
      "authors": "Adelani et al. / Masakhane NLP",
      "url": "https://huggingface.co/masakhane",
      "license": "CC-BY-4.0-NC",
      "license_type": "nc",
      "note": "非商用・学術研究目的のみ使用可。商用利用の場合は別途ライセンスを確認してください。",
      "citation": "@inproceedings{adelani-etal-2022-masakhaner, title={MasakhaNER 2.0}, ...}"
    }
  ]
}
```

## クレジット

外部モデル、データセット、辞書を使う場合は `credits` フィールドを明示します。
BKI は `pip_requires` と `spacy_models` も読み取り、NLP 画面で未導入の Python パッケージや spaCy モデルを表示します。

```json
"credits": [
  {
    "name": "モデル・データセット名",
    "authors": "著者名 / 組織名",
    "url": "https://example.com",
    "license": "Apache 2.0 / MIT / CC-BY-4.0 等",
    "license_type": "open | nc | unknown",
    "note": "制限がある場合はここに明記",
    "citation": "BibTeX形式の引用"
  }
]
```

`license_type: "nc"` のアドオンは BKI のクレジット画面で非商用バッジを表示します。
