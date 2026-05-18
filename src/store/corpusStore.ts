import { create } from 'zustand';
import { ingestFiles, isSupportedIngestFile } from '../lib/ingest';
import type { CorpusDocument } from '../types';
import { useProcessStore } from './processStore';

interface CorpusStore {
  documents: CorpusDocument[];
  selectedIds: string[];
  filter: string;
  setFilter: (filter: string) => void;
  addDocuments: (files: File[]) => Promise<void>;
  updateMetadata: (id: string, meta: Partial<CorpusDocument['metadata']>) => void;
  replaceDocuments: (documents: CorpusDocument[]) => void;
  removeDocument: (id: string) => void;
  toggleSelected: (id: string) => void;
  setSelectedIds: (ids: string[]) => void;
  restoreCorpus: (documents: CorpusDocument[], selectedIds?: string[]) => void;
}

export const useCorpusStore = create<CorpusStore>((set) => ({
  documents: [],
  selectedIds: [],
  filter: '',
  setFilter: (filter) => set({ filter }),
  addDocuments: async (files) => {
    const startedAt = performance.now();
    const supportedFiles = files.filter(isSupportedIngestFile);
    const unsupportedFiles = files.filter((file) => !isSupportedIngestFile(file)).map((file) => file.name);

    useProcessStore.getState().addLog({
      level: 'info',
      stage: 'corpus.ingest',
      title: 'Reading local files',
      detail: `${supportedFiles.length} file(s) queued for corpus ingestion.`,
      data: {
        filenames: files.map((file) => file.name),
        unsupportedFiles,
      },
    });

    if (!supportedFiles.length) {
      useProcessStore.getState().addLog({
        level: 'warning',
        stage: 'corpus.ingest',
        title: 'No supported documents found',
        detail: 'BKI accepts TXT, MD, CSV, TSV, PDF, and DOCX files.',
        data: { unsupportedFiles },
      });
      return;
    }

    const result = await ingestFiles(supportedFiles);
    const { documents } = result;

    if (!documents.length) {
      useProcessStore.getState().addLog({
        level: 'error',
        stage: 'corpus.ingest',
        title: 'No documents were loaded',
        detail: 'The selected files could not be converted into text documents.',
        data: {
          backend: result.backend,
          errors: result.errors,
          unsupportedFiles,
        },
      });
      return;
    }

    set((state) => ({
      documents: [...documents, ...state.documents],
      selectedIds: state.selectedIds.length ? state.selectedIds : documents.slice(0, 1).map((doc) => doc.id),
    }));

    useProcessStore.getState().addLog({
      level: 'success',
      stage: 'corpus.ingest',
      title: 'Documents added to corpus store',
      detail: `${documents.length} document(s) loaded in ${Math.round(performance.now() - startedAt)}ms.`,
      data: {
        backend: result.backend,
        errors: result.errors,
        unsupportedFiles,
        documents: documents.map((document) => ({
          id: document.id,
          filename: document.filename,
          characters: document.content.length,
          language: document.metadata.language,
        })),
      },
    });
  },
  updateMetadata: (id, meta) =>
    set((state) => ({
      documents: state.documents.map((doc) =>
        doc.id === id
          ? {
              ...doc,
              metadata: {
                ...doc.metadata,
                ...meta,
                tags: meta.tags ?? doc.metadata.tags,
              },
            }
          : doc,
      ),
    })),
  replaceDocuments: (documents) =>
    set((state) => {
      const replacements = new Map(documents.map((document) => [document.id, document]));
      return {
        documents: state.documents.map((document) => replacements.get(document.id) ?? document),
      };
    }),
  removeDocument: (id) =>
    set((state) => ({
      documents: state.documents.filter((doc) => doc.id !== id),
      selectedIds: state.selectedIds.filter((selectedId) => selectedId !== id),
    })),
  toggleSelected: (id) =>
    set((state) => ({
      selectedIds: state.selectedIds.includes(id)
        ? state.selectedIds.filter((selectedId) => selectedId !== id)
        : [...state.selectedIds, id],
    })),
  setSelectedIds: (selectedIds) => set({ selectedIds }),
  restoreCorpus: (documents, selectedIds = []) =>
    set({
      documents,
      selectedIds: selectedIds.filter((id) => documents.some((document) => document.id === id)),
      filter: '',
    }),
}));
