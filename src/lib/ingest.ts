import { invoke } from '@tauri-apps/api/core';
import type { CorpusDocument, SupportedLanguage } from '../types';

type IngestError = {
  filename: string;
  error: string;
};

type PythonIngestResult = {
  documents?: CorpusDocument[];
  errors?: IngestError[];
  error?: string;
};

export type IngestResult = {
  documents: CorpusDocument[];
  errors: IngestError[];
  backend: 'python' | 'browser';
};

const supportedExtensionPattern = /\.(txt|md|csv|tsv|pdf|docx)$/i;
const browserTextExtensionPattern = /\.(txt|md|csv|tsv)$/i;

const id = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const detectLanguage = (filename: string, content: string): SupportedLanguage => {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.fr.txt')) return 'fr';
  if (lower.endsWith('.af.txt')) return 'af';
  if (/[ぁ-んァ-ン一-龥]/.test(content)) return 'ja';
  return 'en';
};

export function isSupportedIngestFile(file: File) {
  return supportedExtensionPattern.test(file.name) || file.type.startsWith('text/');
}

function isBrowserTextFile(file: File) {
  return browserTextExtensionPattern.test(file.name) || file.type.startsWith('text/');
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

async function browserIngest(files: File[]): Promise<IngestResult> {
  const documents: CorpusDocument[] = [];
  const errors: IngestError[] = [];

  await Promise.all(
    files.map(async (file) => {
      if (!isBrowserTextFile(file)) {
        errors.push({
          filename: file.name,
          error: 'PDF/DOCX ingestion requires the Python sidecar.',
        });
        return;
      }

      const content = await file.text();
      documents.push({
        id: id(),
        filename: file.name,
        content,
        metadata: {
          tags: [],
          language: detectLanguage(file.name, content),
        },
      });
    }),
  );

  return { documents, errors, backend: 'browser' };
}

export async function ingestFiles(files: File[]): Promise<IngestResult> {
  try {
    const payloadFiles = await Promise.all(
      files.map(async (file) => ({
        filename: file.name,
        content_base64: arrayBufferToBase64(await file.arrayBuffer()),
      })),
    );
    const response = await invoke<PythonIngestResult>('run_python', {
      command: 'ingest',
      payload: { files: payloadFiles },
    });

    if (response.error) throw new Error(response.error);
    return {
      documents: response.documents ?? [],
      errors: response.errors ?? [],
      backend: 'python',
    };
  } catch {
    return browserIngest(files);
  }
}
