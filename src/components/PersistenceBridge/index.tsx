import { useEffect, useRef, useState } from 'react';
import { buildBkiProject } from '../../lib/bkiProject';
import { loadPersistentProject, savePersistentProject } from '../../lib/persistence';
import { useAnalysisStore } from '../../store/analysisStore';
import { useCodingStore } from '../../store/codingStore';
import { useCorpusStore } from '../../store/corpusStore';
import { useProcessStore } from '../../store/processStore';

const AUTOSAVE_DELAY = 1500;

function projectSnapshot(project: ReturnType<typeof buildBkiProject>) {
  return JSON.stringify({
    documents: project.documents,
    selectedIds: project.selectedIds,
    codes: project.codes,
    annotations: project.annotations,
    analysis: project.analysis,
  });
}

function PersistenceBridge() {
  const documents = useCorpusStore((state) => state.documents);
  const selectedIds = useCorpusStore((state) => state.selectedIds);
  const restoreCorpus = useCorpusStore((state) => state.restoreCorpus);
  const codes = useCodingStore((state) => state.codes);
  const annotations = useCodingStore((state) => state.annotations);
  const restoreCoding = useCodingStore((state) => state.restoreCoding);
  const keywordGroups = useAnalysisStore((state) => state.keywordGroups);
  const frequencyResult = useAnalysisStore((state) => state.frequencyResult);
  const groupBy = useAnalysisStore((state) => state.groupBy);
  const stellarPath = useAnalysisStore((state) => state.stellarPath);
  const restoreAnalysis = useAnalysisStore((state) => state.restoreAnalysis);
  const addLog = useProcessStore((state) => state.addLog);
  const [isReady, setIsReady] = useState(false);
  const lastSavedSnapshotRef = useRef<string>('');

  useEffect(() => {
    let isMounted = true;

    void loadPersistentProject()
      .then((result) => {
        if (!isMounted) return;
        if (result.ok && result.project) {
          restoreCorpus(result.project.documents, result.project.selectedIds);
          restoreCoding(result.project.codes, result.project.annotations);
          restoreAnalysis({
            keywordGroups: result.project.analysis.keywordGroups,
            frequencyResult: result.project.analysis.frequencyResult,
            groupBy: result.project.analysis.groupBy,
            stellarPath: result.project.analysis.stellarPath,
          });
          lastSavedSnapshotRef.current = projectSnapshot(result.project);
          addLog({
            level: result.backend === 'sqlite' ? 'success' : 'warning',
            stage: 'persistence.load',
            title: result.backend === 'sqlite' ? 'Project restored on startup' : 'Browser fallback restored on startup',
            detail: result.path ?? result.fallbackReason,
            data: {
              backend: result.backend,
              documentCount: result.project.documents.length,
              codeCount: result.project.codes.length,
              annotationCount: result.project.annotations.length,
            },
          });
        } else {
          addLog({
            level: 'info',
            stage: 'persistence.load',
            title: 'No persisted project on startup',
            detail: result.path ?? result.fallbackReason,
          });
        }
      })
      .catch((error) => {
        if (!isMounted) return;
        addLog({
          level: 'warning',
          stage: 'persistence.load',
          title: 'Startup persistence load failed',
          detail: error instanceof Error ? error.message : String(error),
        });
      })
      .finally(() => {
        if (isMounted) setIsReady(true);
      });

    return () => {
      isMounted = false;
    };
  }, [addLog, restoreAnalysis, restoreCoding, restoreCorpus]);

  useEffect(() => {
    if (!isReady) return undefined;

    const project = buildBkiProject({
      documents,
      selectedIds,
      codes,
      annotations,
      analysis: {
        keywordGroups,
        frequencyResult,
        groupBy,
        stellarPath,
      },
    });
    const snapshot = projectSnapshot(project);

    if (snapshot === lastSavedSnapshotRef.current) return undefined;

    const timer = window.setTimeout(() => {
      void savePersistentProject(project)
        .then((result) => {
          lastSavedSnapshotRef.current = snapshot;
          addLog({
            level: result.backend === 'sqlite' ? 'success' : 'warning',
            stage: 'persistence.autosave',
            title: result.backend === 'sqlite' ? 'Project autosaved to SQLite' : 'Autosaved to browser storage',
            detail: result.path ?? result.fallbackReason,
            data: {
              backend: result.backend,
              documentCount: result.documentCount,
              codeCount: result.codeCount,
              annotationCount: result.annotationCount,
            },
          });
        })
        .catch((error) => {
          addLog({
            level: 'error',
            stage: 'persistence.autosave',
            title: 'Project autosave failed',
            detail: error instanceof Error ? error.message : String(error),
          });
        });
    }, AUTOSAVE_DELAY);

    return () => window.clearTimeout(timer);
  }, [annotations, codes, documents, frequencyResult, groupBy, isReady, keywordGroups, selectedIds, stellarPath, addLog]);

  return null;
}

export default PersistenceBridge;
