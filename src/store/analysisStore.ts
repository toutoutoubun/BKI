import { invoke } from '@tauri-apps/api/core';
import { create } from 'zustand';
import type { CorpusDocument, FrequencyResult, KeywordGroup } from '../types';

interface AnalysisStore {
  keywordGroups: KeywordGroup[];
  frequencyResult?: FrequencyResult;
  groupBy: 'month' | 'year' | 'document' | 'category';
  isRunning: boolean;
  error?: string;
  setGroupBy: (groupBy: AnalysisStore['groupBy']) => void;
  addKeywordGroup: () => void;
  updateKeywordGroup: (id: string, patch: Partial<KeywordGroup>) => void;
  removeKeywordGroup: (id: string) => void;
  runFrequency: (documents: CorpusDocument[]) => Promise<void>;
  clearResults: () => void;
}

const id = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const fallbackFrequency = (
  documents: CorpusDocument[],
  keywordGroups: KeywordGroup[],
  groupBy: AnalysisStore['groupBy'],
): FrequencyResult => {
  const counts: FrequencyResult['counts'] = {};
  const periods = new Set<string>();

  for (const group of keywordGroups) {
    counts[group.name] = {};
    for (const doc of documents) {
      const period =
        groupBy === 'month'
          ? (doc.metadata.date ?? 'unknown').slice(0, 7)
          : groupBy === 'year'
            ? (doc.metadata.date ?? 'unknown').slice(0, 4)
            : groupBy === 'category'
              ? doc.metadata.category || 'uncategorized'
              : doc.filename;
      periods.add(period);
      const total = group.terms.reduce((sum, term) => {
        if (!term.trim()) return sum;
        const matches = doc.content.match(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu'));
        return sum + (matches?.length ?? 0);
      }, 0);
      counts[group.name][period] = (counts[group.name][period] ?? 0) + total;
    }
  }

  const sortedPeriods = [...periods].sort();
  return {
    periods: sortedPeriods,
    months: sortedPeriods,
    groups: keywordGroups.map((group) => group.name),
    counts,
    table: sortedPeriods.map((period) => {
      const row: Record<string, string | number> = { period };
      for (const group of keywordGroups) row[group.name] = counts[group.name]?.[period] ?? 0;
      return row;
    }),
  };
};

export const useAnalysisStore = create<AnalysisStore>((set, get) => ({
  keywordGroups: [
    {
      id: id(),
      name: 'BKI',
      terms: ['BKI', 'bibliometric', 'keyword'],
    },
  ],
  groupBy: 'month',
  isRunning: false,
  setGroupBy: (groupBy) => set({ groupBy }),
  addKeywordGroup: () =>
    set((state) => ({
      keywordGroups: [...state.keywordGroups, { id: id(), name: `Group ${state.keywordGroups.length + 1}`, terms: [] }],
    })),
  updateKeywordGroup: (id, patch) =>
    set((state) => ({
      keywordGroups: state.keywordGroups.map((group) => (group.id === id ? { ...group, ...patch } : group)),
    })),
  removeKeywordGroup: (id) =>
    set((state) => ({
      keywordGroups: state.keywordGroups.filter((group) => group.id !== id),
    })),
  runFrequency: async (documents) => {
    const { keywordGroups, groupBy } = get();
    const keywords = Object.fromEntries(keywordGroups.map((group) => [group.name, group.terms.filter(Boolean)]));
    set({ isRunning: true, error: undefined });

    try {
      const result = await invoke<FrequencyResult>('run_python', {
        command: 'frequency',
        payload: {
          documents,
          keywords,
          group_by: groupBy,
        },
      });
      set({ frequencyResult: result, isRunning: false });
    } catch (error) {
      set({
        frequencyResult: fallbackFrequency(documents, keywordGroups, groupBy),
        error: error instanceof Error ? error.message : String(error),
        isRunning: false,
      });
    }
  },
  clearResults: () => set({ frequencyResult: undefined, error: undefined }),
}));

