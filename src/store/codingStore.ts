import { create } from 'zustand';
import type { Annotation, Code } from '../types';
import { useProcessStore } from './processStore';

export interface ImportedCode {
  label: string;
  color?: string;
  description?: string;
  parentLabel?: string;
}

interface CodingStore {
  codes: Code[];
  annotations: Annotation[];
  addCode: (code: Omit<Code, 'id'>) => void;
  importCodes: (codes: ImportedCode[]) => void;
  updateCode: (id: string, patch: Partial<Code>) => void;
  removeCode: (id: string) => void;
  addAnnotation: (ann: Omit<Annotation, 'id'>) => void;
  importAnnotations: (annotations: Array<Omit<Annotation, 'id'>>) => void;
  updateAnnotation: (id: string, patch: Partial<Annotation>) => void;
  removeAnnotation: (id: string) => void;
  restoreCoding: (codes: Code[], annotations: Annotation[]) => void;
}

const id = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const defaultCodeColors = ['#2f80ed', '#226f54', '#b55b18', '#8a4f9e', '#ba3b46', '#597245'];
const normalizeLabel = (label: string) => label.trim().toLowerCase();
const normalizeColor = (color: string | undefined, index: number) =>
  /^#[0-9a-f]{6}$/iu.test(color ?? '') ? color as string : defaultCodeColors[index % defaultCodeColors.length];

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
  importCodes: (items) => {
    let imported = 0;
    let skipped = 0;
    set((state) => {
      const existingByLabel = new Map(state.codes.map((code) => [normalizeLabel(code.label), code.id]));
      const createdSeeds: Array<{ id: string; item: ImportedCode; index: number }> = [];

      items.forEach((item, index) => {
        const label = item.label.trim();
        const key = normalizeLabel(label);
        if (!label || existingByLabel.has(key)) {
          skipped += 1;
          return;
        }
        const nextId = id();
        existingByLabel.set(key, nextId);
        createdSeeds.push({ id: nextId, item: { ...item, label }, index });
      });

      const nextCodes = createdSeeds.map(({ id: codeId, item, index }) => {
        const parentId = item.parentLabel ? existingByLabel.get(normalizeLabel(item.parentLabel)) : undefined;
        return {
          id: codeId,
          label: item.label.trim(),
          color: normalizeColor(item.color, index),
          description: item.description?.trim() || undefined,
          parentId: parentId && parentId !== codeId ? parentId : undefined,
        };
      });
      imported = nextCodes.length;
      return { codes: [...state.codes, ...nextCodes] };
    });
    useProcessStore.getState().addLog({
      level: imported > 0 ? 'success' : 'warning',
      stage: 'qda.codebook',
      title: 'Codebook CSV imported',
      detail: `${imported} code(s) imported; ${skipped} duplicate or empty row(s) skipped.`,
      data: {
        imported,
        skipped,
      },
    });
  },
  updateCode: (id, patch) => {
    set((state) => ({
      codes: state.codes.map((code) => (code.id === id ? { ...code, ...patch } : code)),
    }));
    useProcessStore.getState().addLog({
      level: 'success',
      stage: 'qda.code',
      title: 'Code updated',
      detail: patch.label ? `${patch.label} was updated.` : `Updated code ${id}.`,
      data: {
        codeId: id,
        patch,
      },
    });
  },
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
  importAnnotations: (items) => {
    const nextAnnotations = items.map((annotation) => ({ ...annotation, id: id() }));
    set((state) => ({ annotations: [...state.annotations, ...nextAnnotations] }));
    useProcessStore.getState().addLog({
      level: nextAnnotations.length > 0 ? 'success' : 'warning',
      stage: 'qda.annotations',
      title: 'Annotation CSV imported',
      detail: `${nextAnnotations.length} annotation(s) imported.`,
      data: {
        imported: nextAnnotations.length,
        documentCount: new Set(nextAnnotations.map((annotation) => annotation.documentId)).size,
        codeCount: new Set(nextAnnotations.flatMap((annotation) => annotation.codeIds)).size,
      },
    });
  },
  updateAnnotation: (id, patch) => {
    set((state) => ({
      annotations: state.annotations.map((ann) => (ann.id === id ? { ...ann, ...patch } : ann)),
    }));
    useProcessStore.getState().addLog({
      level: 'success',
      stage: 'qda.annotation',
      title: 'Annotation updated',
      detail: `Updated annotation ${id}.`,
      data: {
        annotationId: id,
        start: patch.start,
        end: patch.end,
        codeCount: patch.codeIds?.length,
        hasMemo: typeof patch.memo === 'string' ? Boolean(patch.memo.trim()) : undefined,
      },
    });
  },
  removeAnnotation: (id) =>
    set((state) => ({
      annotations: state.annotations.filter((ann) => ann.id !== id),
    })),
  restoreCoding: (codes, annotations) => set({ codes, annotations }),
}));
