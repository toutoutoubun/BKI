import { create } from 'zustand';
import type { Annotation, Code } from '../types';

interface CodingStore {
  codes: Code[];
  annotations: Annotation[];
  addCode: (code: Omit<Code, 'id'>) => void;
  updateCode: (id: string, patch: Partial<Code>) => void;
  removeCode: (id: string) => void;
  addAnnotation: (ann: Omit<Annotation, 'id'>) => void;
  updateAnnotation: (id: string, patch: Partial<Annotation>) => void;
  removeAnnotation: (id: string) => void;
}

const id = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const useCodingStore = create<CodingStore>((set) => ({
  codes: [
    {
      id: id(),
      label: 'Theme',
      color: '#2f80ed',
      description: 'Initial qualitative code',
    },
  ],
  annotations: [],
  addCode: (code) => set((state) => ({ codes: [...state.codes, { ...code, id: id() }] })),
  updateCode: (id, patch) =>
    set((state) => ({
      codes: state.codes.map((code) => (code.id === id ? { ...code, ...patch } : code)),
    })),
  removeCode: (id) =>
    set((state) => ({
      codes: state.codes.filter((code) => code.id !== id),
      annotations: state.annotations.map((ann) => ({
        ...ann,
        codeIds: ann.codeIds.filter((codeId) => codeId !== id),
      })),
    })),
  addAnnotation: (ann) => set((state) => ({ annotations: [...state.annotations, { ...ann, id: id() }] })),
  updateAnnotation: (id, patch) =>
    set((state) => ({
      annotations: state.annotations.map((ann) => (ann.id === id ? { ...ann, ...patch } : ann)),
    })),
  removeAnnotation: (id) =>
    set((state) => ({
      annotations: state.annotations.filter((ann) => ann.id !== id),
    })),
}));

