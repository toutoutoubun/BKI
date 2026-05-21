# BKI

BKI (Bibliometric & Keyword Intelligence) is a local-first desktop app for humanities researchers. It combines corpus management, qualitative coding, keyword intelligence, and export workflows in one Tauri + React + Python application.

## Stack

- Tauri 2
- React 19 + TypeScript + Vite
- Zustand
- react-i18next
- Python stdin/stdout JSON sidecar
- SQLite schema for local project data

## Development

```bash
npm install
npm run dev
npm run tauri dev
```

The Python sidecar can be tested directly:

```bash
echo '{"command":"frequency","payload":{"documents":[{"id":"1","filename":"sample.txt","content":"BKI BKI research","metadata":{"date":"2026-05-18","tags":[]}}],"keywords":{"BKI":["BKI"]},"group_by":"document"}}' | python3 python/main.py
```

## NLP Layer 2c

The sidecar exposes additional local NLP commands:

- `ner`
- `topic_model`
- `similarity`
- `pos`
- `dependency`
- `lexical_stats`
- `get_languages`
- `get_credits`

The text-mining layer also includes `kwic`, `cooccurrence`, `collocation`, `keyness`, `tfidf`, and `sentiment` for local corpus statistics without leaving BKI. The QDA workspace links coded passages back to keyword groups through a code-keyword matrix, evidence table, and mixed-methods CSV export. Reviewer annotation CSVs can also be compared against the primary coding set with Cohen's kappa, F1, disagreement evidence, and reliability CSV export. The quantitative workspace now includes an R-style statistics workbench for document-level data frames, normalized tidy frames, descriptives, Pearson/Spearman correlations with Benjamini-Hochberg correction, ANOVA and Kruskal-Wallis factor models, pairwise factor contrasts, category effects, linear trends, and reproducible R script export.

Language add-ons are discovered from `~/Documents/BKI/addons/`. See [docs/ADDON_GUIDE.md](docs/ADDON_GUIDE.md).

## Desktop Releases

GitHub Actions can build BKI installers for macOS, Windows, and Linux from version tags. See [docs/RELEASE.md](docs/RELEASE.md) for the release workflow, signing notes, and the current Python runtime requirement.
