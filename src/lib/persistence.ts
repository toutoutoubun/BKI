import { invoke } from '@tauri-apps/api/core';
import type { BkiProjectFile } from '../types';
import { parseBkiProject } from './bkiProject';

const LOCAL_STORAGE_KEY = 'bki.project.autosave';

type PersistenceBackend = 'sqlite' | 'localStorage';

interface SqliteSaveResponse {
  ok?: boolean;
  error?: string;
  path?: string;
  document_count?: number;
  code_count?: number;
  annotation_count?: number;
}

interface SqliteLoadResponse {
  ok?: boolean;
  error?: string;
  missing?: boolean;
  path?: string;
  project?: unknown;
}

export interface SavePersistentProjectResult {
  ok: boolean;
  backend: PersistenceBackend;
  path?: string;
  fallbackReason?: string;
  documentCount?: number;
  codeCount?: number;
  annotationCount?: number;
}

export interface LoadPersistentProjectResult {
  ok: boolean;
  backend: PersistenceBackend;
  path?: string;
  project?: BkiProjectFile;
  missing?: boolean;
  fallbackReason?: string;
}

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function saveLocalProject(project: BkiProjectFile) {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(project));
}

function loadLocalProject() {
  const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
  return raw ? parseBkiProject(JSON.parse(raw)) : undefined;
}

export async function savePersistentProject(project: BkiProjectFile): Promise<SavePersistentProjectResult> {
  try {
    const response = await invoke<SqliteSaveResponse>('run_python', {
      command: 'save_sqlite_project',
      payload: { project },
    });
    if (response.error) throw new Error(response.error);
    if (!response.ok) throw new Error('SQLite save returned an unsuccessful response.');

    return {
      ok: true,
      backend: 'sqlite',
      path: response.path,
      documentCount: response.document_count,
      codeCount: response.code_count,
      annotationCount: response.annotation_count,
    };
  } catch (error) {
    saveLocalProject(project);
    return {
      ok: true,
      backend: 'localStorage',
      fallbackReason: messageFrom(error),
      documentCount: project.documents.length,
      codeCount: project.codes.length,
      annotationCount: project.annotations.length,
    };
  }
}

export async function loadPersistentProject(): Promise<LoadPersistentProjectResult> {
  let sqliteMissing: SqliteLoadResponse | undefined;

  try {
    const response = await invoke<SqliteLoadResponse>('run_python', {
      command: 'load_sqlite_project',
      payload: {},
    });
    if (response.error) throw new Error(response.error);
    if (response.ok && response.project) {
      return {
        ok: true,
        backend: 'sqlite',
        path: response.path,
        project: parseBkiProject(response.project),
      };
    }
    sqliteMissing = response;
  } catch (error) {
    sqliteMissing = {
      ok: false,
      missing: true,
      error: messageFrom(error),
    };
  }

  const localProject = loadLocalProject();
  if (localProject) {
    return {
      ok: true,
      backend: 'localStorage',
      project: localProject,
      fallbackReason: sqliteMissing.error,
    };
  }

  return {
    ok: false,
    backend: sqliteMissing.path ? 'sqlite' : 'localStorage',
    path: sqliteMissing.path,
    missing: true,
    fallbackReason: sqliteMissing.error,
  };
}
