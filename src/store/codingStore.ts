import { create } from 'zustand';
import type { Annotation, Code } from '../types';
import { useProcessStore } from './processStore';

interface CodingStore {
  codes: Code[];
  annotations: Annotation[];
  addCode: (code: Omit<Code, 'id'>) => void;
  updateCode: (id: string, patch: Partial<Code>) => void;
  removeCode: (id: string) => void;
  addAnnotation: (ann: Omit<Annotation, 'id'>) => void;
  updateAnnotation: (id: string, patch: Partial<Annotation>) => void;
  removeAnnotation: (id: string) => void;
  restoreCoding: (codes: Code[], annotations: Annotation[]) => void;
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
  addCode: (code) => {
    const nextCode = { ...code, id: id() };
    set((state) => ({ codes: [...state.codes, nextCode] }));
    useProcessStore.getState().addLog({
      level: 'success',
      stage: 'qda.code',
      title: 'Code created',
      detail: `${nextCode.label} was added to the codebook.`,
      data: {
        codeId: nextCode.id,
        label: nextCode.label,
        color: nextCode.color,
      },
    });
  },
  updateCode: (id, patch) =>
    set((state) => ({
      codes: state.codes.map((code) => (code.id === id ? { ...code, ...patch } : code)),
    })),
  removeCode: (id) =>
    set((state) => ({
      codes: state.codes
        .filter((code) => code.id !== id)
        .map((code) => (code.parentId === id ? { ...code, parentId: undefined } : code)),
      annotations: state.annotations.map((ann) => ({
        ...ann,
        codeIds: ann.codeIds.filter((codeId) => codeId !== id),
      })),
    })),
  addAnnotation: (ann) => {
    const nextAnnotation = { ...ann, id: id() };
    set((state) => ({ annotations: [...state.annotations, nextAnnotation] }));
    useProcessStore.getState().addLog({
      level: 'success',
      stage: 'qda.annotation',
      title: 'Text range coded',
      detail: `Created annotation ${nextAnnotation.start}-${nextAnnotation.end}.`,
      data: {
        annotationId: nextAnnotation.id,
        documentId: nextAnnotation.documentId,
        start: nextAnnotation.start,
        end: nextAnnotation.end,
        codeCount: nextAnnotation.codeIds.length,
      },
    });
  },
  updateAnnotation: (id, patch) =>
    set((state) => ({
      annotations: state.annotations.map((ann) => (ann.id === id ? { ...ann, ...patch } : ann)),
    })),
  removeAnnotation: (id) =>
    set((state) => ({
      annotations: state.annotations.filter((ann) => ann.id !== id),
    })),
  restoreCoding: (codes, annotations) => set({ codes, annotations }),
}));
