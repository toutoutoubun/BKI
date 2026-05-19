import { AlertTriangle, FlaskConical } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { runPreprocess } from '../../lib/preprocess';
import { useCodingStore } from '../../store/codingStore';
import { useCorpusStore } from '../../store/corpusStore';
import { useProcessStore } from '../../store/processStore';
import type { CorpusDocument, PreprocessOptions, PreprocessResult } from '../../types';

interface Props {
  documents: CorpusDocument[];
}

function PreprocessTab({ documents }: Props) {
  const { t } = useTranslation();
  const replaceDocuments = useCorpusStore((state) => state.replaceDocuments);
  const annotations = useCodingStore((state) => state.annotations);
  const addLog = useProcessStore((state) => state.addLog);
  const [options, setOptions] = useState<PreprocessOptions>({
    normalize: true,
    lowercase: false,
    punctuation: true,
    stopwords: false,
    stemming: false,
  });
  const [status, setStatus] = useState<string>('');
  const [result, setResult] = useState<PreprocessResult>();
  const [preview, setPreview] = useState<{ before: string; after: string; filename: string }>();
  const [error, setError] = useState<string>();
  const [isRunning, setIsRunning] = useState(false);

  const totalCharacters = useMemo(() => documents.reduce((sum, doc) => sum + doc.content.length, 0), [documents]);
  const affectedAnnotationCount = useMemo(() => {
    const documentIds = new Set(documents.map((document) => document.id));
    return annotations.filter((annotation) => documentIds.has(annotation.documentId)).length;
  }, [annotations, documents]);

  const toggle = (key: keyof typeof options) => setOptions((current) => ({ ...current, [key]: !current[key] }));
  const formatStopwordSource = (source: string) => {
    const labels: Record<string, string> = {
      language_addon: t('preprocess.stopwordSourceAddon'),
      built_in: t('preprocess.stopwordSourceBuiltIn'),
      browser_builtin: t('preprocess.stopwordSourceBrowser'),
      disabled: t('preprocess.stopwordSourceDisabled'),
    };
    return labels[source] ?? source;
  };

  const run = async () => {
    const startedAt = performance.now();
    setIsRunning(true);
    setError(undefined);
    setResult(undefined);
    addLog({
      level: 'info',
      stage: 'preprocess.run',
      title: 'Preprocessing requested',
      detail: 'Sending active corpus documents and preprocessing options to the sidecar.',
      data: {
        documentCount: documents.length,
        options,
        affectedAnnotationCount,
      },
    });

    try {
      const response = await runPreprocess(documents, options);
      const changed = response.stats.per_document.find((item) => item.changed) ?? response.stats.per_document[0];
      if (changed) {
        const before = documents.find((document) => document.id === changed.document_id);
        const after = response.documents.find((document) => document.id === changed.document_id);
        if (before && after) {
          setPreview({
            filename: before.filename,
            before: before.content.slice(0, 500),
            after: after.content.slice(0, 500),
          });
        }
      }
      replaceDocuments(response.documents);
      setResult(response);
      setStatus(new Date().toLocaleTimeString());
      addLog({
        level: response.backend === 'python' ? 'success' : 'warning',
        stage: 'preprocess.run',
        title: response.backend === 'python' ? 'Preprocessing completed' : 'Browser preprocessing fallback used',
        detail: `Completed in ${Math.round(performance.now() - startedAt)}ms.`,
        data: {
          backend: response.backend,
          changedDocuments: response.stats.changed_documents,
          originalCharacters: response.stats.original_characters,
          processedCharacters: response.stats.processed_characters,
          removedStopwords: response.stats.removed_stopwords,
          stopwordSources: response.stats.stopwords_sources,
          stemmedTerms: response.stats.stemmed_terms,
          affectedAnnotationCount,
        },
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
      addLog({
        level: 'error',
        stage: 'preprocess.run',
        title: 'Preprocessing failed',
        detail: message,
      });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="work-grid">
      <section className="panel">
        <div className="panel-header">
          <h2 className="section-title">{t('preprocess.title')}</h2>
          <button className="primary-button" type="button" disabled={isRunning || documents.length === 0} onClick={() => void run()}>
            <FlaskConical size={17} />
            {t('common.run')}
          </button>
        </div>
        <div className="panel-body">
          <div className="checkbox-list">
            {(['normalize', 'lowercase', 'punctuation', 'stopwords', 'stemming'] as const).map((key) => (
              <label className="checkbox-row" key={key}>
                <input type="checkbox" checked={options[key]} onChange={() => toggle(key)} />
                <span>{t(`preprocess.${key}`)}</span>
              </label>
            ))}
          </div>
          {options.stopwords && <div className="result-row compact"><span className="muted">{t('preprocess.stopwordsAddonHint')}</span></div>}
          {affectedAnnotationCount > 0 && (
            <div className="result-row compact warning-row">
              <strong>
                <AlertTriangle size={16} />
                {t('preprocess.annotationWarningTitle')}
              </strong>
              <span className="muted">{t('preprocess.annotationWarning', { count: affectedAnnotationCount })}</span>
            </div>
          )}
          {documents.length === 0 && <div className="empty-state">{t('preprocess.noDocuments')}</div>}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2 className="section-title">{t('preprocess.status')}</h2>
        </div>
        <div className="panel-body">
          <div className="result-row">
            <span className="muted">{t('preprocess.documentCount')}</span>
            <strong>{documents.length}</strong>
          </div>
          <div className="result-row">
            <span className="muted">{t('preprocess.totalCharacters')}</span>
            <strong>{totalCharacters.toLocaleString()}</strong>
          </div>
          <div className="result-row">
            <span className="muted">{t('preprocess.status')}</span>
            <strong>{isRunning ? t('preprocess.running') : status || t('common.none')}</strong>
          </div>
          {result && (
            <>
              <div className="result-row">
                <span className="muted">{t('preprocess.backend')}</span>
                <strong>{result.backend === 'python' ? t('preprocess.backendPython') : t('preprocess.backendBrowser')}</strong>
              </div>
              <div className="result-row">
                <span className="muted">{t('preprocess.changedDocuments')}</span>
                <strong>{result.stats.changed_documents} / {result.stats.document_count}</strong>
              </div>
              <div className="result-row">
                <span className="muted">{t('preprocess.processedCharacters')}</span>
                <strong>{result.stats.processed_characters.toLocaleString()} ({result.stats.character_delta.toLocaleString()})</strong>
              </div>
              <div className="result-row">
                <span className="muted">{t('preprocess.removedStopwords')}</span>
                <strong>{result.stats.removed_stopwords.toLocaleString()}</strong>
              </div>
              {result.stats.stopwords_sources && result.stats.stopwords_sources.length > 0 && (
                <div className="result-row">
                  <span className="muted">{t('preprocess.stopwordSource')}</span>
                  <strong>{result.stats.stopwords_sources.map(formatStopwordSource).join(', ')}</strong>
                </div>
              )}
              <div className="result-row">
                <span className="muted">{t('preprocess.stemmedTerms')}</span>
                <strong>{result.stats.stemmed_terms.toLocaleString()}</strong>
              </div>
            </>
          )}
          {error && (
            <div className="result-row compact warning-row">
              <strong>{t('preprocess.error')}</strong>
              <span className="muted">{error}</span>
            </div>
          )}
        </div>
      </section>
      {preview && (
        <section className="panel span-all">
          <div className="panel-header">
            <h2 className="section-title">{t('preprocess.preview')}</h2>
            <span className="muted">{preview.filename}</span>
          </div>
          <div className="panel-body preview-grid">
            <div className="selection-preview">
              <strong>{t('preprocess.before')}</strong>
              <p>{preview.before || t('common.none')}</p>
            </div>
            <div className="selection-preview">
              <strong>{t('preprocess.after')}</strong>
              <p>{preview.after || t('common.none')}</p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

export default PreprocessTab;
