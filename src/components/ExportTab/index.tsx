import { invoke } from '@tauri-apps/api/core';
import { Archive, Database, Download, FileText, RefreshCw, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { buildBkiProject, parseBkiProject } from '../../lib/bkiProject';
import { loadPersistentProject, savePersistentProject } from '../../lib/persistence';
import { useAnalysisStore } from '../../store/analysisStore';
import { useCodingStore } from '../../store/codingStore';
import { useCorpusStore } from '../../store/corpusStore';
import { useProcessStore } from '../../store/processStore';
import type { BkiProjectFile, CorpusDocument } from '../../types';

interface Props {
  documents: CorpusDocument[];
}

function downloadText(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function toCsv(rows: Array<Record<string, string | number>>) {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escape = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
  return [headers.join(','), ...rows.map((row) => headers.map((header) => escape(row[header] ?? '')).join(','))].join('\n');
}

type ExportResponse = {
  content?: string;
  mime?: string;
  error?: string;
};

type BundleExportResponse = {
  ok?: boolean;
  path?: string;
  files?: string[];
  count?: number;
  error?: string;
};

function truncate(value: string, limit = 240) {
  return value.length > limit ? `${value.slice(0, limit - 3)}...` : value;
}

function safeFilename(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim() || 'document';
}

function ExportTab({ documents }: Props) {
  const { t } = useTranslation();
  const projectInputRef = useRef<HTMLInputElement>(null);
  const [importMessage, setImportMessage] = useState<string>('');
  const [persistentMessage, setPersistentMessage] = useState<string>('');
  const [bundleMessage, setBundleMessage] = useState<string>('');
  const [isPersisting, setIsPersisting] = useState(false);
  const [isBundleExporting, setIsBundleExporting] = useState(false);
  const codes = useCodingStore((state) => state.codes);
  const annotations = useCodingStore((state) => state.annotations);
  const restoreCoding = useCodingStore((state) => state.restoreCoding);
  const frequencyResult = useAnalysisStore((state) => state.frequencyResult);
  const keywordGroups = useAnalysisStore((state) => state.keywordGroups);
  const groupBy = useAnalysisStore((state) => state.groupBy);
  const stellarPath = useAnalysisStore((state) => state.stellarPath);
  const setStellarPath = useAnalysisStore((state) => state.setStellarPath);
  const restoreAnalysis = useAnalysisStore((state) => state.restoreAnalysis);
  const selectedIds = useCorpusStore((state) => state.selectedIds);
  const restoreCorpus = useCorpusStore((state) => state.restoreCorpus);
  const addLog = useProcessStore((state) => state.addLog);

  const buildCurrentProject = () =>
    buildBkiProject({
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

  const restoreProject = (parsed: BkiProjectFile) => {
    restoreCorpus(parsed.documents, parsed.selectedIds);
    restoreCoding(parsed.codes, parsed.annotations);
    restoreAnalysis({
      keywordGroups: parsed.analysis.keywordGroups,
      frequencyResult: parsed.analysis.frequencyResult,
      groupBy: parsed.analysis.groupBy,
      stellarPath: parsed.analysis.stellarPath,
    });
  };

  const exportProject = () => {
    const project = buildCurrentProject();

    downloadText(
      'bki-project.bki',
      JSON.stringify(project, null, 2),
      'application/json;charset=utf-8',
    );
    addLog({
      level: 'success',
      stage: 'project.export',
      title: '.bki project exported',
      detail: 'Project state was serialized for local download.',
      data: {
        documentCount: documents.length,
        codeCount: codes.length,
        annotationCount: annotations.length,
        keywordGroupCount: keywordGroups.length,
      },
    });
  };

  const exportCsv = () => {
    const rows = frequencyResult?.table ?? [];
    if (rows.length) downloadText('bki-frequency.csv', toCsv(rows), 'text/csv;charset=utf-8');
  };

  const codebookRows = () =>
    codes.map((code) => ({
      id: code.id,
      label: code.label,
      description: code.description ?? '',
      parent: codes.find((candidate) => candidate.id === code.parentId)?.label ?? '',
      color: code.color,
      annotations: annotations.filter((annotation) => annotation.codeIds.includes(code.id)).length,
    }));

  const annotationRows = () =>
    annotations.map((annotation) => {
      const document = documents.find((candidate) => candidate.id === annotation.documentId);
      return {
        id: annotation.id,
        document: document?.filename ?? annotation.documentId,
        start: annotation.start,
        end: annotation.end,
        codes: annotation.codeIds
          .map((codeId) => codes.find((code) => code.id === codeId)?.label ?? codeId)
          .join(', '),
        memo: annotation.memo ?? '',
        excerpt: document ? truncate(document.content.slice(annotation.start, annotation.end), 180) : '',
      };
    });

  const buildReportPayload = () => {
    const codedDocumentIds = new Set(annotations.map((annotation) => annotation.documentId));
    return {
      format: 'markdown',
      title: 'BKI Research Report',
      summary: {
        Documents: documents.length,
        Codes: codes.length,
        Annotations: annotations.length,
        'Keyword groups': keywordGroups.length,
        'Frequency grouping': groupBy,
      },
      sections: [
        {
          title: 'Corpus',
          rows: documents.map((document) => ({
            filename: document.filename,
            language: document.metadata.language ?? '',
            date: document.metadata.date ?? '',
            author: document.metadata.author ?? '',
            category: document.metadata.category ?? '',
            tags: document.metadata.tags.join(', '),
            characters: document.content.length,
            coded: codedDocumentIds.has(document.id) ? 'yes' : 'no',
          })),
        },
        {
          title: 'Codebook',
          rows: codebookRows().map(({ id: _id, color: _color, ...row }) => row),
        },
        {
          title: 'Annotations',
          rows: annotationRows().slice(0, 100).map(({ id: _id, start, end, ...row }) => ({ ...row, range: `${start}-${end}` })),
        },
        {
          title: 'Keyword Frequency',
          rows: frequencyResult?.table ?? [],
        },
      ],
    };
  };

  const browserReport = () => {
    const payload = buildReportPayload();
    const lines = [`# ${payload.title}`, '', '## Summary', ''];
    Object.entries(payload.summary).forEach(([key, value]) => lines.push(`- **${key}**: ${value}`));
    payload.sections.forEach((section) => {
      lines.push('', `## ${section.title}`, '');
      if (!section.rows.length) {
        lines.push('_No data._');
        return;
      }
      const headers = Object.keys(section.rows[0]);
      lines.push(`| ${headers.join(' | ')} |`);
      lines.push(`| ${headers.map(() => '---').join(' | ')} |`);
      section.rows.forEach((row) => {
        lines.push(`| ${headers.map((header) => String(row[header] ?? '').replaceAll('|', '\\|').replaceAll('\n', '<br>')).join(' | ')} |`);
      });
    });
    return `${lines.join('\n')}\n`;
  };

  const exportMarkdownReport = async () => {
    const startedAt = performance.now();
    addLog({
      level: 'info',
      stage: 'project.report',
      title: 'Markdown report export requested',
      detail: 'Preparing corpus, coding, and frequency summaries for report generation.',
      data: {
        documentCount: documents.length,
        codeCount: codes.length,
        annotationCount: annotations.length,
        hasFrequencyResult: Boolean(frequencyResult?.table?.length),
      },
    });

    try {
      const response = await invoke<ExportResponse>('run_python', {
        command: 'export',
        payload: buildReportPayload(),
      });
      if (response.error || !response.content) throw new Error(response.error || 'Python exporter returned no content.');
      downloadText('bki-report.md', response.content, response.mime ?? 'text/markdown;charset=utf-8');
      addLog({
        level: 'success',
        stage: 'project.report',
        title: 'Markdown report exported',
        detail: `Python exporter completed in ${Math.round(performance.now() - startedAt)}ms.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      downloadText('bki-report.md', browserReport(), 'text/markdown;charset=utf-8');
      addLog({
        level: 'warning',
        stage: 'project.report',
        title: 'Browser fallback report exported',
        detail: message,
      });
    }
  };

  const buildBundleFiles = () => {
    const project = buildCurrentProject();
    const files = [
      {
        path: 'bki-project.bki',
        content: JSON.stringify(project, null, 2),
      },
      {
        path: 'bki-report.md',
        content: browserReport(),
      },
      {
        path: 'codebook.csv',
        content: toCsv(codebookRows()),
      },
      {
        path: 'annotations.csv',
        content: toCsv(annotationRows()),
      },
      ...documents.map((document, index) => ({
        path: `corpus/${String(index + 1).padStart(3, '0')}-${safeFilename(document.filename)}.txt`,
        content: document.content,
      })),
    ];

    if (frequencyResult?.table?.length) {
      files.push({
        path: 'frequency.csv',
        content: toCsv(frequencyResult.table),
      });
    }

    return files;
  };

  const exportStellarBundle = async () => {
    const outputPath = stellarPath.trim();
    if (!outputPath) return;
    setIsBundleExporting(true);
    setBundleMessage('');
    addLog({
      level: 'info',
      stage: 'project.bundle',
      title: 'Folder bundle export requested',
      detail: outputPath,
      data: {
        documentCount: documents.length,
        codeCount: codes.length,
        annotationCount: annotations.length,
        hasFrequencyResult: Boolean(frequencyResult?.table?.length),
      },
    });

    try {
      const response = await invoke<BundleExportResponse>('run_python', {
        command: 'export',
        payload: {
          format: 'bundle',
          output_dir: outputPath,
          files: buildBundleFiles(),
        },
      });
      if (response.error || !response.ok) throw new Error(response.error || 'Bundle export failed.');
      setBundleMessage(t('export.bundleSuccess', { count: response.count ?? response.files?.length ?? 0, path: response.path ?? outputPath }));
      addLog({
        level: 'success',
        stage: 'project.bundle',
        title: 'Folder bundle exported',
        detail: response.path ?? outputPath,
        data: {
          fileCount: response.count ?? response.files?.length ?? 0,
          files: response.files,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setBundleMessage(t('export.bundleError'));
      addLog({
        level: 'error',
        stage: 'project.bundle',
        title: 'Folder bundle export failed',
        detail: message,
      });
    } finally {
      setIsBundleExporting(false);
    }
  };

  const importProject = async (file: File) => {
    addLog({
      level: 'info',
      stage: 'project.import',
      title: '.bki project import requested',
      detail: file.name,
      data: {
        bytes: file.size,
      },
    });

    try {
      const parsed = parseBkiProject(JSON.parse(await file.text()));
      restoreProject(parsed);
      setImportMessage(t('export.importSuccess'));
      addLog({
        level: 'success',
        stage: 'project.import',
        title: '.bki project restored',
        detail: 'Corpus, codes, annotations, and analysis settings were loaded into the current session.',
        data: {
          documentCount: parsed.documents.length,
          codeCount: parsed.codes.length,
          annotationCount: parsed.annotations.length,
          keywordGroupCount: parsed.analysis.keywordGroups.length,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setImportMessage(t('export.importError'));
      addLog({
        level: 'error',
        stage: 'project.import',
        title: '.bki project import failed',
        detail: message,
      });
    }
  };

  const savePersistent = async () => {
    const project = buildCurrentProject();
    setIsPersisting(true);
    setPersistentMessage('');
    addLog({
      level: 'info',
      stage: 'persistence.save',
      title: 'Persistent project save requested',
      detail: 'Writing the current project state to SQLite through the Python sidecar.',
      data: {
        documentCount: project.documents.length,
        codeCount: project.codes.length,
        annotationCount: project.annotations.length,
      },
    });

    try {
      const result = await savePersistentProject(project);
      setPersistentMessage(
        result.backend === 'sqlite'
          ? t('export.persistentSaveSuccess', { path: result.path })
          : t('export.persistentSaveFallback'),
      );
      addLog({
        level: result.backend === 'sqlite' ? 'success' : 'warning',
        stage: 'persistence.save',
        title: result.backend === 'sqlite' ? 'Project saved to SQLite' : 'Browser fallback save used',
        detail: result.path ?? result.fallbackReason,
        data: { ...result },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setPersistentMessage(t('export.persistentError'));
      addLog({
        level: 'error',
        stage: 'persistence.save',
        title: 'Persistent project save failed',
        detail: message,
      });
    } finally {
      setIsPersisting(false);
    }
  };

  const loadPersistent = async () => {
    setIsPersisting(true);
    setPersistentMessage('');
    addLog({
      level: 'info',
      stage: 'persistence.load',
      title: 'Persistent project load requested',
      detail: 'Reading the latest persisted project from SQLite.',
    });

    try {
      const result = await loadPersistentProject();
      if (!result.ok || !result.project) {
        setPersistentMessage(t('export.persistentLoadMissing'));
        addLog({
          level: 'warning',
          stage: 'persistence.load',
          title: 'No persisted project was found',
          detail: result.path ?? result.fallbackReason,
        });
        return;
      }

      restoreProject(result.project);
      setPersistentMessage(
        result.backend === 'sqlite'
          ? t('export.persistentLoadSuccess', { path: result.path })
          : t('export.persistentLoadFallback'),
      );
      addLog({
        level: result.backend === 'sqlite' ? 'success' : 'warning',
        stage: 'persistence.load',
        title: result.backend === 'sqlite' ? 'Project restored from SQLite' : 'Browser fallback project restored',
        detail: result.path ?? result.fallbackReason,
        data: {
          backend: result.backend,
          documentCount: result.project.documents.length,
          codeCount: result.project.codes.length,
          annotationCount: result.project.annotations.length,
          keywordGroupCount: result.project.analysis.keywordGroups.length,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setPersistentMessage(t('export.persistentError'));
      addLog({
        level: 'error',
        stage: 'persistence.load',
        title: 'Persistent project load failed',
        detail: message,
      });
    } finally {
      setIsPersisting(false);
    }
  };

  return (
    <div className="work-grid">
      <section className="panel">
        <div className="panel-header">
          <h2 className="section-title">{t('export.title')}</h2>
        </div>
        <div className="panel-body">
          <div className="result-row">
            <strong>{t('export.projectFile')}</strong>
            <span className="muted">{documents.length} {t('preprocess.documentCount')}</span>
            <div className="toolbar">
              <button className="ghost-button" type="button" onClick={() => projectInputRef.current?.click()}>
                <Upload size={17} />
                {t('export.importProject')}
              </button>
              <button className="primary-button" type="button" onClick={exportProject}>
                <Download size={17} />
                {t('export.downloadProject')}
              </button>
            </div>
            <input
              ref={projectInputRef}
              type="file"
              accept=".bki,application/json"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importProject(file);
                event.currentTarget.value = '';
              }}
            />
            {importMessage && <span className="muted">{importMessage}</span>}
          </div>
          <div className="result-row">
            <strong>{t('export.sqlitePersistence')}</strong>
            <span className="muted">{t('export.sqliteHint')}</span>
            <div className="toolbar">
              <button
                className="ghost-button"
                type="button"
                disabled={isPersisting}
                onClick={() => void loadPersistent()}
              >
                <RefreshCw size={17} />
                {t('export.loadPersistent')}
              </button>
              <button
                className="primary-button"
                type="button"
                disabled={isPersisting || (documents.length === 0 && codes.length === 0 && annotations.length === 0)}
                onClick={() => void savePersistent()}
              >
                <Database size={17} />
                {t('export.savePersistent')}
              </button>
            </div>
            {persistentMessage && <span className="muted">{persistentMessage}</span>}
          </div>
          <div className="result-row">
            <strong>{t('export.csv')}</strong>
            <span className="muted">{frequencyResult?.table?.length ?? 0} {t('preprocess.status')}</span>
            <button className="ghost-button" type="button" disabled={!frequencyResult?.table?.length} onClick={exportCsv}>
              <Download size={17} />
              {t('export.downloadCsv')}
            </button>
          </div>
          <div className="result-row">
            <strong>{t('export.markdownReport')}</strong>
            <span className="muted">{t('export.markdownReportHint')}</span>
            <button className="ghost-button" type="button" disabled={documents.length === 0 && codes.length === 0 && annotations.length === 0} onClick={() => void exportMarkdownReport()}>
              <FileText size={17} />
              {t('export.downloadReport')}
            </button>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2 className="section-title">{t('export.stellarPath')}</h2>
        </div>
        <div className="panel-body">
          <label className="field">
            <span>{t('export.stellarHint')}</span>
            <input className="text-input" value={stellarPath} onChange={(event) => setStellarPath(event.target.value)} />
          </label>
          <button
            className="primary-button"
            type="button"
            disabled={isBundleExporting || !stellarPath.trim() || (documents.length === 0 && codes.length === 0 && annotations.length === 0)}
            onClick={() => void exportStellarBundle()}
          >
            <Archive size={17} />
            {t('export.exportBundle')}
          </button>
          <span className="muted">{t('export.bundleHint')}</span>
          {bundleMessage && <span className="muted">{bundleMessage}</span>}
          {!frequencyResult && <div className="empty-state">{t('export.noResult')}</div>}
        </div>
      </section>
    </div>
  );
}

export default ExportTab;
