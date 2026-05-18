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

Language add-ons are discovered from `~/Documents/BKI/addons/`. See [docs/ADDON_GUIDE.md](docs/ADDON_GUIDE.md).
