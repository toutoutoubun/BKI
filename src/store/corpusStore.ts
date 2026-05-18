import { create } from 'zustand';
import type { CorpusDocument, SupportedLanguage } from '../types';

interface CorpusStore {
  documents: CorpusDocument[];
  selectedIds: string[];
  filter: string;
  setFilter: (filter: string) => void;
  addDocuments: (files: File[]) => Promise<void>;
  updateMetadata: (id: string, meta: Partial<CorpusDocument['metadata']>) => void;
  removeDocument: (id: string) => void;
  toggleSelected: (id: string) => void;
  setSelectedIds: (ids: string[]) => void;
}

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

export const useCorpusStore = create<CorpusStore>((set) => ({
  documents: [],
  selectedIds: [],
  filter: '',
  setFilter: (filter) => set({ filter }),
  addDocuments: async (files) => {
    const documents = await Promise.all(
      files.map(async (file) => {
        const content = await file.text();
        return {
          id: id(),
          filename: file.name,
          content,
          metadata: {
            tags: [],
            language: detectLanguage(file.name, content),
          },
        } satisfies CorpusDocument;
      }),
    );

    set((state) => ({
      documents: [...documents, ...state.documents],
      selectedIds: state.selectedIds.length ? state.selectedIds : documents.slice(0, 1).map((doc) => doc.id),
    }));
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
}));

