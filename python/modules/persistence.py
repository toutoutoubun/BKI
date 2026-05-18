from __future__ import annotations

import json
import os
import sqlite3
from pathlib import Path
from typing import Any

DEFAULT_DB_PATH = Path.home() / "Documents" / "BKI" / "bki.sqlite"
DB_PATH = Path(os.environ.get("BKI_SQLITE_PATH", DEFAULT_DB_PATH)).expanduser()
DB_DIR = DB_PATH.parent

SCHEMA = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  content TEXT NOT NULL,
  date TEXT,
  author TEXT,
  category TEXT,
  language TEXT DEFAULT 'en',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS document_tags (
  document_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  PRIMARY KEY (document_id, tag),
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS codes (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  color TEXT DEFAULT '#4CAF50',
  description TEXT,
  parent_id TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS annotations (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  start_offset INTEGER NOT NULL,
  end_offset INTEGER NOT NULL,
  memo TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS annotation_codes (
  annotation_id TEXT NOT NULL,
  code_id TEXT NOT NULL,
  PRIMARY KEY (annotation_id, code_id),
  FOREIGN KEY (annotation_id) REFERENCES annotations(id) ON DELETE CASCADE,
  FOREIGN KEY (code_id) REFERENCES codes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS analysis_configs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT,
  config_json TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
"""


def _connect() -> sqlite3.Connection:
    DB_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _clear(conn: sqlite3.Connection) -> None:
    for table in [
        "annotation_codes",
        "annotations",
        "codes",
        "document_tags",
        "documents",
        "analysis_configs",
    ]:
        conn.execute(f"DELETE FROM {table}")


def save_project(payload: dict[str, Any]) -> dict[str, Any]:
    project = payload.get("project") or {}
    documents = project.get("documents") or []
    codes = project.get("codes") or []
    annotations = project.get("annotations") or []
    analysis = project.get("analysis") or {}

    with _connect() as conn:
        _clear(conn)
        for document in documents:
            metadata = document.get("metadata") or {}
            conn.execute(
                """
                INSERT INTO documents (id, filename, content, date, author, category, language)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    document.get("id"),
                    document.get("filename"),
                    document.get("content", ""),
                    metadata.get("date"),
                    metadata.get("author"),
                    metadata.get("category"),
                    metadata.get("language", "en"),
                ),
            )
            for tag in metadata.get("tags") or []:
                conn.execute(
                    "INSERT OR IGNORE INTO document_tags (document_id, tag) VALUES (?, ?)",
                    (document.get("id"), tag),
                )

        for code in codes:
            conn.execute(
                """
                INSERT INTO codes (id, label, color, description, parent_id)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    code.get("id"),
                    code.get("label"),
                    code.get("color", "#4CAF50"),
                    code.get("description"),
                    code.get("parentId"),
                ),
            )

        for annotation in annotations:
            conn.execute(
                """
                INSERT INTO annotations (id, document_id, start_offset, end_offset, memo)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    annotation.get("id"),
                    annotation.get("documentId"),
                    int(annotation.get("start", 0)),
                    int(annotation.get("end", 0)),
                    annotation.get("memo"),
                ),
            )
            for code_id in annotation.get("codeIds") or []:
                conn.execute(
                    "INSERT OR IGNORE INTO annotation_codes (annotation_id, code_id) VALUES (?, ?)",
                    (annotation.get("id"), code_id),
                )

        configs = {
            "keyword_groups": analysis.get("keywordGroups") or [],
            "frequency_result": analysis.get("frequencyResult"),
            "project_state": {
                "selectedIds": project.get("selectedIds") or [],
                "groupBy": analysis.get("groupBy", "month"),
                "stellarPath": analysis.get("stellarPath"),
                "file_type": project.get("file_type"),
                "schema_version": project.get("schema_version"),
                "app_version": project.get("app_version"),
                "exported_at": project.get("exported_at"),
            },
        }
        for config_id, config in configs.items():
            conn.execute(
                """
                INSERT INTO analysis_configs (id, type, name, config_json)
                VALUES (?, ?, ?, ?)
                """,
                (config_id, config_id, config_id, json.dumps(config, ensure_ascii=False)),
            )

    return {
        "ok": True,
        "path": str(DB_PATH),
        "document_count": len(documents),
        "code_count": len(codes),
        "annotation_count": len(annotations),
    }


def _config(conn: sqlite3.Connection, config_id: str, fallback: Any) -> Any:
    row = conn.execute("SELECT config_json FROM analysis_configs WHERE id = ?", (config_id,)).fetchone()
    if not row:
        return fallback
    try:
        return json.loads(row["config_json"])
    except json.JSONDecodeError:
        return fallback


def load_project(payload: dict[str, Any] | None = None) -> dict[str, Any]:
    del payload
    if not DB_PATH.exists():
        return {"ok": False, "missing": True, "path": str(DB_PATH)}

    with _connect() as conn:
        documents = []
        for row in conn.execute("SELECT * FROM documents ORDER BY created_at, filename").fetchall():
            tags = [
                tag_row["tag"]
                for tag_row in conn.execute(
                    "SELECT tag FROM document_tags WHERE document_id = ? ORDER BY tag",
                    (row["id"],),
                ).fetchall()
            ]
            documents.append(
                {
                    "id": row["id"],
                    "filename": row["filename"],
                    "content": row["content"],
                    "metadata": {
                        "date": row["date"],
                        "author": row["author"],
                        "category": row["category"],
                        "tags": tags,
                        "language": row["language"],
                    },
                }
            )

        codes = [
            {
                "id": row["id"],
                "label": row["label"],
                "color": row["color"],
                "description": row["description"],
                "parentId": row["parent_id"],
            }
            for row in conn.execute("SELECT * FROM codes ORDER BY created_at, label").fetchall()
        ]

        annotations = []
        for row in conn.execute("SELECT * FROM annotations ORDER BY created_at").fetchall():
            code_ids = [
                code_row["code_id"]
                for code_row in conn.execute(
                    "SELECT code_id FROM annotation_codes WHERE annotation_id = ?",
                    (row["id"],),
                ).fetchall()
            ]
            annotations.append(
                {
                    "id": row["id"],
                    "documentId": row["document_id"],
                    "start": row["start_offset"],
                    "end": row["end_offset"],
                    "codeIds": code_ids,
                    "memo": row["memo"],
                }
            )

        project_state = _config(conn, "project_state", {})
        project = {
            "file_type": "bki.project",
            "schema_version": 1,
            "app_version": project_state.get("app_version", "0.1.0"),
            "exported_at": project_state.get("exported_at"),
            "documents": documents,
            "selectedIds": project_state.get("selectedIds") or [],
            "codes": codes,
            "annotations": annotations,
            "analysis": {
                "keywordGroups": _config(conn, "keyword_groups", []),
                "frequencyResult": _config(conn, "frequency_result", None),
                "groupBy": project_state.get("groupBy", "month"),
                "stellarPath": project_state.get("stellarPath"),
            },
        }

    return {"ok": True, "path": str(DB_PATH), "project": project}
