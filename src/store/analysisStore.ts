import { invoke } from '@tauri-apps/api/core';
import { create } from 'zustand';
import type { CorpusDocument, FrequencyResult, KeywordGroup } from '../types';
import { useProcessStore } from './processStore';

interface AnalysisStore {
  keywordGroups: KeywordGroup[];
  frequencyResult?: FrequencyResult;
  groupBy: 'month' | 'year' | 'document' | 'category';
  stellarPath: string;
  isRunning: boolean;
  error?: string;
  setGroupBy: (groupBy: AnalysisStore['groupBy']) => void;
  setStellarPath: (stellarPath: string) => void;
  addKeywordGroup: () => void;
  updateKeywordGroup: (id: string, patch: Partial<KeywordGroup>) => void;
  removeKeywordGroup: (id: string) => void;
  runFrequency: (documents: CorpusDocument[]) => Promise<void>;
  clearResults: () => void;
  restoreAnalysis: (analysis: {
    keywordGroups?: KeywordGroup[];
    frequencyResult?: FrequencyResult;
    groupBy?: AnalysisStore['groupBy'];
    stellarPath?: string;
  }) => void;
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
  stellarPath: '~/Documents/BKI/Stellar',
  isRunning: false,
  setGroupBy: (groupBy) => set({ groupBy }),
  setStellarPath: (stellarPath) => set({ stellarPath }),
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
    const startedAt = performance.now();
    set({ isRunning: true, error: undefined });
    useProcessStore.getState().addLog({
      level: 'info',
      stage: 'analysis.frequency',
      title: 'Frequency analysis requested',
      detail: 'Preparing keyword groups and selected corpus documents for the Python sidecar.',
      data: {
        command: 'frequency',
        documentCount: documents.length,
        groupBy,
        keywordGroups: Object.entries(keywords).map(([name, terms]) => ({ name, termCount: terms.length })),
      },
    });

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
      useProcessStore.getState().addLog({
        level: 'success',
        stage: 'analysis.frequency',
        title: 'Python sidecar returned frequency results',
        detail: `Completed in ${Math.round(performance.now() - startedAt)}ms.`,
        data: {
          groups: result.groups,
          periodCount: result.periods.length,
          rowCount: result.table?.length ?? 0,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const fallbackResult = fallbackFrequency(documents, keywordGroups, groupBy);
      set({
        frequencyResult: fallbackResult,
        error: message,
        isRunning: false,
      });
      useProcessStore.getState().addLog({
        level: 'warning',
        stage: 'analysis.frequency',
        title: 'Python sidecar unavailable; browser fallback used',
        detail: message,
        data: {
          groups: fallbackResult.groups,
          periodCount: fallbackResult.periods.length,
          rowCount: fallbackResult.table?.length ?? 0,
        },
      });
    }
  },
  clearResults: () => set({ frequencyResult: undefined, error: undefined }),
  restoreAnalysis: (analysis) =>
    set({
      keywordGroups: analysis.keywordGroups?.length ? analysis.keywordGroups : get().keywordGroups,
      frequencyResult: analysis.frequencyResult,
      groupBy: analysis.groupBy ?? 'month',
      stellarPath: analysis.stellarPath ?? get().stellarPath,
      error: undefined,
      isRunning: false,
    }),
}));
