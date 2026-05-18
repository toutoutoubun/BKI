import { create } from 'zustand';

export type ProcessLogLevel = 'info' | 'success' | 'warning' | 'error';

export interface ProcessLog {
  id: string;
  timestamp: string;
  level: ProcessLogLevel;
  stage: string;
  title: string;
  detail?: string;
  data?: Record<string, unknown>;
}

interface ProcessStore {
  isOpen: boolean;
  logs: ProcessLog[];
  setOpen: (isOpen: boolean) => void;
  toggleOpen: () => void;
  addLog: (log: Omit<ProcessLog, 'id' | 'timestamp'>) => void;
  clearLogs: () => void;
}

const id = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const useProcessStore = create<ProcessStore>((set) => ({
  isOpen: false,
  logs: [],
  setOpen: (isOpen) => set({ isOpen }),
  toggleOpen: () => set((state) => ({ isOpen: !state.isOpen })),
  addLog: (log) =>
    set((state) => ({
      logs: [
        {
          ...log,
          id: id(),
          timestamp: new Date().toISOString(),
        },
        ...state.logs,
      ].slice(0, 200),
    })),
  clearLogs: () => set({ logs: [] }),
}));
