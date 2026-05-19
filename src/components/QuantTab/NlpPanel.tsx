import { invoke } from '@tauri-apps/api/core';
import { Brain, Download, Play, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fallbackLanguages, loadAvailableLanguages, type LanguageCatalog } from '../../lib/languageAddons';
import { useProcessStore } from '../../store/processStore';
import type { CorpusDocument } from '../../types';

type NlpCommand = 'ner' | 'topic_model' | 'similarity' | 'pos' | 'dependency' | 'lexical_stats';
type TopicMethod = 'nmf' | 'lda';
type MetadataField = 'month' | 'year' | 'document' | 'category';

interface Props {
  documents: CorpusDocument[];
}

const entityTypes = ['PERSON', 'ORG', 'GPE', 'DATE'];
const posTags = ['NOUN', 'VERB', 'ADJ', 'ADV'];

const commandOptions: Array<{ id: NlpCommand; labelKey: string }> = [
  { id: 'ner', labelKey: 'nlp.ner' },
  { id: 'topic_model', labelKey: 'nlp.topicModel' },
  { id: 'similarity', labelKey: 'nlp.similarity' },
  { id: 'pos', labelKey: 'nlp.pos' },
  { id: 'dependency', labelKey: 'nlp.dependency' },
  { id: 'lexical_stats', labelKey: 'nlp.lexicalStats' },
];

type CsvValue = string | number | boolean | null | undefined;

function downloadText(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function toCsv(rows: Array<Record<string, CsvValue>>) {
  if (!rows.length) return '';
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const escape = (value: CsvValue) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  return [headers.join(','), ...rows.map((row) => headers.map((header) => escape(row[header])).join(','))].join('\n');
}

function resultCount(command: NlpCommand, result: unknown): number {
  const data = result as Record<string, unknown>;
  if (command === 'ner') return Array.isArray(data.entities) ? data.entities.length : 0;
  if (command === 'topic_model') return Array.isArray(data.topics) ? data.topics.length : 0;
  if (command === 'similarity') return Array.isArray(data.ranked) ? data.ranked.length : 0;
  if (command === 'pos') return Object.keys((data.distribution as object | undefined) ?? {}).length;
  if (command === 'dependency') return Array.isArray(data.triples) ? data.triples.length : 0;
  if (command === 'lexical_stats') return Array.isArray(data.per_document) ? data.per_document.length : 0;
  return 0;
}

function nlpRows(command: NlpCommand, result: unknown, documents: CorpusDocument[]): Array<Record<string, CsvValue>> {
  const data = result as Record<string, any>;
  const documentName = (id: string) => documents.find((document) => document.id === id)?.filename ?? id;

  if (command === 'ner') {
    const entityRows = (data.entities ?? []).map((entity: any) => ({
      section: 'entities',
      document: documentName(entity.document_id),
      date: entity.date ?? '',
      text: entity.text,
      label: entity.label,
      start: entity.start,
      end: entity.end,
      context: entity.context,
    }));
    const timelineRows = Object.entries(data.timeline ?? {}).flatMap(([label, periods]) =>
      Object.entries(periods as Record<string, Record<string, number>>).flatMap(([period, values]) =>
        Object.entries(values).map(([text, count]) => ({
          section: 'timeline',
          label,
          period,
          text,
          count,
        })),
      ),
    );
    return [...entityRows, ...timelineRows];
  }

  if (command === 'topic_model') {
    const topicRows = (data.topics ?? []).flatMap((topic: any) =>
      (topic.top_words ?? []).map((word: any, rank: number) => ({
        section: 'topic_words',
        topic: Number(topic.id) + 1,
        rank: rank + 1,
        word: word.word,
        weight: word.weight,
      })),
    );
    const matrixRows = (data.doc_topic_matrix ?? []).flatMap((row: any) =>
      (row.topic_weights ?? []).map((weight: number, topicIndex: number) => ({
        section: 'document_topic_matrix',
        document: documentName(row.document_id),
        topic: topicIndex + 1,
        weight,
      })),
    );
    const trendRows = Object.entries(data.topic_over_time ?? {}).flatMap(([topicId, periods]) =>
      Object.entries(periods as Record<string, number>).map(([period, weight]) => ({
        section: 'topic_trend',
        topic: Number(topicId) + 1,
        period,
        weight,
      })),
    );
    return [...topicRows, ...matrixRows, ...trendRows];
  }

  if (command === 'similarity') {
    const clusterByDocument = new Map<string, string>();
    Object.entries(data.clusters ?? {}).forEach(([clusterId, ids]) => {
      (ids as string[]).forEach((id) => clusterByDocument.set(id, String(Number(clusterId) + 1)));
    });
    const rankedRows = (data.ranked ?? []).map((item: any) => ({
      section: 'ranked',
      document: documentName(item.document_id),
      document_id: item.document_id,
      score: item.score,
      cluster: clusterByDocument.get(item.document_id) ?? '',
    }));
    const clusterRows = Object.entries(data.clusters ?? {}).flatMap(([clusterId, ids]) =>
      (ids as string[]).map((id) => ({
        section: 'clusters',
        cluster: Number(clusterId) + 1,
        document: documentName(id),
        document_id: id,
      })),
    );
    const matrixRows = (data.similarity_matrix ?? []).flatMap((row: number[], sourceIndex: number) =>
      row.map((score, targetIndex) => ({
        section: 'similarity_matrix',
        source: documents[sourceIndex]?.filename ?? String(sourceIndex),
        target: documents[targetIndex]?.filename ?? String(targetIndex),
        score,
      })),
    );
    return [...rankedRows, ...clusterRows, ...matrixRows];
  }

  if (command === 'pos') {
    const distributionRows = Object.entries(data.distribution ?? {}).flatMap(([period, values]) =>
      Object.entries(values as Record<string, number>).map(([tag, count]) => ({
        section: 'distribution',
        period,
        tag,
        count,
      })),
    );
    const topWordRows = Object.entries(data.top_words ?? {}).flatMap(([tag, words]) =>
      (words as Array<{ word: string; count: number }>).map((item, rank) => ({
        section: 'top_words',
        tag,
        rank: rank + 1,
        word: item.word,
        count: item.count,
      })),
    );
    return [...distributionRows, ...topWordRows];
  }

  if (command === 'dependency') {
    return (data.triples ?? []).map((triple: any) => ({
      section: 'triples',
      document: documentName(triple.document_id),
      date: triple.date ?? '',
      subject: triple.subject,
      verb: triple.verb,
      object: triple.object,
      sentence: triple.sentence,
    }));
  }

  const documentRows = (data.per_document ?? []).map((row: any) => ({
    section: 'per_document',
    document: documentName(row.document_id),
    document_id: row.document_id,
    date: row.date ?? '',
    token_count: row.token_count,
    type_count: row.type_count,
    ttr: row.ttr,
    avg_sentence_len: row.avg_sentence_len,
    avg_word_len: row.avg_word_len,
  }));
  const timeRows = Object.entries(data.over_time ?? {}).map(([period, values]) => ({
    section: 'over_time',
    period,
    ...(values as Record<string, number>),
  }));
  return [...documentRows, ...timeRows];
}

function renderPreview(command: NlpCommand, result: unknown, documents: CorpusDocument[], t: (key: string) => string) {
  const data = result as Record<string, any>;
  const documentName = (id: string) => documents.find((document) => document.id === id)?.filename ?? id;
  if (command === 'ner') {
    return (data.entities ?? []).slice(0, 8).map((entity: any) => (
      <div className="result-row compact" key={`${entity.document_id}-${entity.start}-${entity.text}`}>
        <strong>{entity.text}</strong>
        <span className="muted">{entity.label} · {entity.date ?? t('common.none')}</span>
      </div>
    ));
  }
  if (command === 'topic_model') {
    return (
      <>
        {(data.topics ?? []).slice(0, 6).map((topic: any) => (
          <div className="result-row compact" key={topic.id}>
            <strong>{t('nlp.topic')} {topic.id + 1}</strong>
            <span className="muted">{(topic.top_words ?? []).map((word: any) => word.word).join(', ')}</span>
          </div>
        ))}
        {Object.entries(data.topic_over_time ?? {}).slice(0, 6).map(([topicId, periods]) => (
          <div className="result-row compact" key={`topic-trend-${topicId}`}>
            <strong>{t('nlp.topicTrend')} {Number(topicId) + 1}</strong>
            <span className="muted">
              {Object.entries(periods as Record<string, number>)
                .slice(0, 8)
                .map(([period, score]) => `${period}: ${Number(score).toFixed(3)}`)
                .join(' · ')}
            </span>
          </div>
        ))}
      </>
    );
  }
  if (command === 'similarity') {
    return (
      <>
        {(data.ranked ?? []).slice(0, 8).map((item: any) => (
          <div className="result-row compact" key={item.document_id}>
            <strong>{documentName(item.document_id)}</strong>
            <span className="muted">{t('nlp.score')}: {Number(item.score).toFixed(3)}</span>
          </div>
        ))}
        {Object.entries(data.clusters ?? {}).map(([clusterId, ids]) => (
          <div className="result-row compact" key={`cluster-${clusterId}`}>
            <strong>{t('nlp.cluster')} {Number(clusterId) + 1}</strong>
            <span className="muted">{(ids as string[]).map(documentName).join(' · ')}</span>
          </div>
        ))}
      </>
    );
  }
  if (command === 'pos') {
    return Object.entries(data.distribution ?? {}).slice(0, 8).map(([period, values]) => (
      <div className="result-row compact" key={period}>
        <strong>{period}</strong>
        <span className="muted">
          {Object.entries(values as Record<string, number>).map(([key, value]) => `${key}:${value}`).join(' · ')}
        </span>
      </div>
    ));
  }
  if (command === 'dependency') {
    return (data.triples ?? []).slice(0, 8).map((triple: any, index: number) => (
      <div className="result-row compact" key={`${triple.document_id}-${index}`}>
        <strong>{[triple.subject, triple.verb, triple.object].filter(Boolean).join(' / ')}</strong>
        <span className="muted">{triple.sentence}</span>
      </div>
    ));
  }
  return (data.per_document ?? []).slice(0, 8).map((row: any) => (
    <div className="result-row compact" key={row.document_id}>
      <strong>{row.document_id}</strong>
      <span className="muted">TTR {row.ttr} · {row.token_count} tokens</span>
    </div>
  ));
}

function NlpPanel({ documents }: Props) {
  const { t } = useTranslation();
  const addLog = useProcessStore((state) => state.addLog);
  const [command, setCommand] = useState<NlpCommand>('ner');
  const [language, setLanguage] = useState('en');
  const [selectedEntities, setSelectedEntities] = useState(entityTypes);
  const [selectedPosTags, setSelectedPosTags] = useState(posTags);
  const [topicCount, setTopicCount] = useState(5);
  const [topicMethod, setTopicMethod] = useState<TopicMethod>('nmf');
  const [topicWordCount, setTopicWordCount] = useState(10);
  const [topicMetadataField, setTopicMetadataField] = useState<MetadataField>('month');
  const [clusterCount, setClusterCount] = useState(3);
  const [targetEntity, setTargetEntity] = useState('');
  const [queryDocumentId, setQueryDocumentId] = useState('');
  const [languageCatalog, setLanguageCatalog] = useState<LanguageCatalog>({ languages: fallbackLanguages });
  const [isLanguageLoading, setIsLanguageLoading] = useState(false);
  const [result, setResult] = useState<unknown>();
  const [error, setError] = useState<string>();
  const [isRunning, setIsRunning] = useState(false);

  const activeDocumentId = useMemo(() => queryDocumentId || documents[0]?.id || '', [documents, queryDocumentId]);
  const selectedLanguage = useMemo(
    () => languageCatalog.languages.find((item) => item.code === language) ?? languageCatalog.languages[0],
    [language, languageCatalog.languages],
  );
  const isCommandSupported = useMemo(
    () => Boolean(selectedLanguage?.capabilities.includes(command)),
    [command, selectedLanguage],
  );

  const refreshLanguages = async () => {
    setIsLanguageLoading(true);
    const catalog = await loadAvailableLanguages();
    setLanguageCatalog(catalog);
    setLanguage((current) => (catalog.languages.some((item) => item.code === current) ? current : (catalog.languages[0]?.code ?? 'en')));
    addLog({
      level: catalog.fallback ? 'warning' : 'success',
      stage: 'nlp.languages',
      title: catalog.fallback ? 'Language add-on discovery fallback used' : 'Language add-ons discovered',
      detail: catalog.fallback ? (catalog.error ?? 'Using built-in language metadata.') : (catalog.addons_dir ?? ''),
      data: {
        languageCount: catalog.languages.length,
        addonsDir: catalog.addons_dir,
        fallback: Boolean(catalog.fallback),
      },
    });
    setIsLanguageLoading(false);
  };

  useEffect(() => {
    void refreshLanguages();
  }, []);

  const payload = () => {
    const base = { documents, language };
    if (command === 'ner') return { ...base, entity_types: selectedEntities, group_by: 'month' };
    if (command === 'topic_model') return { ...base, method: topicMethod, n_topics: topicCount, n_words: topicWordCount, metadata_field: topicMetadataField };
    if (command === 'similarity') return { ...base, method: 'tfidf_cosine', query_document_id: activeDocumentId, n_clusters: Math.min(clusterCount, Math.max(1, documents.length)) };
    if (command === 'pos') return { ...base, group_by: 'month', pos_tags: selectedPosTags };
    if (command === 'dependency') return { ...base, target_entity: targetEntity };
    return base;
  };

  const run = async () => {
    if (!isCommandSupported) return;
    const requestPayload = payload();
    const startedAt = performance.now();
    setIsRunning(true);
    setError(undefined);
    addLog({
      level: 'info',
      stage: `nlp.${command}`,
      title: 'NLP sidecar command requested',
      detail: 'Sending analysis settings and corpus summaries to the Python sidecar.',
      data: {
        command,
        documentCount: documents.length,
        language,
        languageName: selectedLanguage?.name,
        options:
          command === 'ner'
            ? { entityTypes: selectedEntities }
            : command === 'pos'
              ? { posTags: selectedPosTags }
              : command === 'topic_model'
                ? { topicCount, topicMethod, topicWordCount, topicMetadataField }
                : command === 'dependency'
                  ? { targetEntity }
                  : command === 'similarity'
                    ? { queryDocumentId: activeDocumentId, clusterCount }
                    : {},
      },
    });

    try {
      const response = await invoke('run_python', { command, payload: requestPayload });
      setResult(response);
      addLog({
        level: 'success',
        stage: `nlp.${command}`,
        title: 'NLP command completed',
        detail: `Completed in ${Math.round(performance.now() - startedAt)}ms.`,
        data: {
          resultCount: resultCount(command, response),
          fallback: Boolean((response as Record<string, unknown>)?.fallback),
          tokenizerSource: (response as Record<string, unknown>)?.tokenizer_source,
        },
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
      setResult(undefined);
      addLog({
        level: 'error',
        stage: `nlp.${command}`,
        title: 'NLP command failed',
        detail: message,
      });
    } finally {
      setIsRunning(false);
    }
  };

  const toggleEntity = (entity: string) => {
    setSelectedEntities((current) => (current.includes(entity) ? current.filter((item) => item !== entity) : [...current, entity]));
  };

  const togglePos = (tag: string) => {
    setSelectedPosTags((current) => (current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]));
  };

  const exportResultCsv = () => {
    if (result === undefined || result === null) return;
    const rows = nlpRows(command, result, documents);
    if (!rows.length) return;
    downloadText(`bki-nlp-${command}.csv`, toCsv(rows), 'text/csv;charset=utf-8');
    addLog({
      level: 'success',
      stage: `nlp.${command}`,
      title: 'NLP result exported',
      detail: `${rows.length} row(s) were exported to CSV.`,
      data: {
        command,
        rowCount: rows.length,
      },
    });
  };

  return (
    <section className="panel span-all">
      <div className="panel-header">
        <h2 className="section-title">{t('nlp.title')}</h2>
        <div className="toolbar">
          <button className="ghost-button" type="button" disabled={result === undefined || result === null} onClick={exportResultCsv}>
            <Download size={17} />
            {t('nlp.exportCsv')}
          </button>
          <button className="primary-button" type="button" disabled={isRunning || documents.length === 0 || !isCommandSupported} onClick={() => void run()}>
            <Play size={17} />
            {t('common.run')}
          </button>
        </div>
      </div>
      <div className="panel-body">
        <div className="nlp-grid">
          <label className="field">
            <span>{t('nlp.analysis')}</span>
            <select className="select-input" value={command} onChange={(event) => setCommand(event.target.value as NlpCommand)}>
              {commandOptions.map((option) => (
                <option key={option.id} value={option.id} disabled={!selectedLanguage?.capabilities.includes(option.id)}>
                  {t(option.labelKey)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t('corpus.language')}</span>
            <div className="field-inline">
              <select className="select-input" value={language} onChange={(event) => setLanguage(event.target.value)}>
                {languageCatalog.languages.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.name}
                  </option>
                ))}
              </select>
              <button className="icon-button" type="button" title={t('nlp.reloadLanguages')} disabled={isLanguageLoading} onClick={() => void refreshLanguages()}>
                <RefreshCw size={16} />
              </button>
            </div>
          </label>
          {command === 'topic_model' && (
            <>
              <label className="field">
                <span>{t('nlp.topicMethod')}</span>
                <select className="select-input" value={topicMethod} onChange={(event) => setTopicMethod(event.target.value as TopicMethod)}>
                  <option value="nmf">{t('nlp.topicMethodNmf')}</option>
                  <option value="lda">{t('nlp.topicMethodLda')}</option>
                </select>
              </label>
              <label className="field">
                <span>{t('nlp.topicTimelineField')}</span>
                <select className="select-input" value={topicMetadataField} onChange={(event) => setTopicMetadataField(event.target.value as MetadataField)}>
                  <option value="month">{t('nlp.fieldMonth')}</option>
                  <option value="year">{t('nlp.fieldYear')}</option>
                  <option value="document">{t('nlp.fieldDocument')}</option>
                  <option value="category">{t('nlp.fieldCategory')}</option>
                </select>
              </label>
              <label className="field">
                <span>{t('nlp.topicCount')}</span>
                <input className="text-input" type="range" min={2} max={20} value={topicCount} onChange={(event) => setTopicCount(Number(event.target.value))} />
                <span className="muted">{topicCount}</span>
              </label>
              <label className="field">
                <span>{t('nlp.topicWordCount')}</span>
                <input className="text-input" type="number" min={3} max={30} value={topicWordCount} onChange={(event) => setTopicWordCount(Number(event.target.value))} />
              </label>
            </>
          )}
          {command === 'similarity' && (
            <>
              <label className="field">
                <span>{t('nlp.queryDocument')}</span>
                <select className="select-input" value={activeDocumentId} onChange={(event) => setQueryDocumentId(event.target.value)}>
                  {documents.map((document) => (
                    <option key={document.id} value={document.id}>
                      {document.filename}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>{t('nlp.clusterCount')}</span>
                <input
                  className="text-input"
                  type="range"
                  min={1}
                  max={Math.max(1, Math.min(12, documents.length || 1))}
                  value={Math.min(clusterCount, Math.max(1, documents.length || 1))}
                  onChange={(event) => setClusterCount(Number(event.target.value))}
                />
                <span className="muted">{Math.min(clusterCount, Math.max(1, documents.length || 1))}</span>
              </label>
            </>
          )}
          {command === 'dependency' && (
            <label className="field">
              <span>{t('nlp.targetEntity')}</span>
              <input className="text-input" value={targetEntity} onChange={(event) => setTargetEntity(event.target.value)} />
            </label>
          )}
        </div>

        {selectedLanguage && (
          <div className="language-capability-panel">
            <div className="toolbar">
              <span className="badge">{selectedLanguage.built_in ? t('nlp.builtInLanguage') : t('nlp.addonLanguage')}</span>
              {languageCatalog.fallback && <span className="badge unknown">{t('nlp.languageFallback')}</span>}
              {(selectedLanguage.license_warnings ?? []).map((warning) => (
                <span className={warning.license_type === 'nc' ? 'badge nc' : 'badge unknown'} key={`${warning.name}-${warning.license_type}`} title={warning.note}>
                  {t('nlp.licenseWarning')}
                </span>
              ))}
              {selectedLanguage.tokenizer_source && <span className="muted">{t('nlp.tokenizer')}: {selectedLanguage.tokenizer_source}</span>}
              {languageCatalog.addons_dir && <span className="muted">{t('nlp.addonsDir')}: {languageCatalog.addons_dir}</span>}
            </div>
            <div className="capability-list" aria-label={t('nlp.availableCapabilities')}>
              {commandOptions.map((option) => (
                <span className={selectedLanguage.capabilities.includes(option.id) ? 'capability-chip active' : 'capability-chip'} key={option.id}>
                  {t(option.labelKey)}
                </span>
              ))}
            </div>
          </div>
        )}

        {command === 'ner' && (
          <div className="toolbar">
            {entityTypes.map((entity) => (
              <label className="checkbox-row" key={entity}>
                <input type="checkbox" checked={selectedEntities.includes(entity)} onChange={() => toggleEntity(entity)} />
                <span>{entity}</span>
              </label>
            ))}
          </div>
        )}
        {command === 'pos' && (
          <div className="toolbar">
            {posTags.map((tag) => (
              <label className="checkbox-row" key={tag}>
                <input type="checkbox" checked={selectedPosTags.includes(tag)} onChange={() => togglePos(tag)} />
                <span>{tag}</span>
              </label>
            ))}
          </div>
        )}

        {!isCommandSupported && selectedLanguage && (
          <div className="muted">
            {t('nlp.unsupportedCapability', {
              analysis: t(commandOptions.find((option) => option.id === command)?.labelKey ?? 'nlp.analysis'),
              language: selectedLanguage.name,
            })}
          </div>
        )}
        {error && <div className="muted">{t('nlp.pythonRequired')}</div>}
        {!result && !error && <div className="empty-state"><Brain size={20} />{t('nlp.noResult')}</div>}
        {result !== undefined && result !== null && (
          <div className="nlp-result">
            <div className="result-row compact">
              <strong>{t('nlp.resultCount')}</strong>
              <span className="muted">{resultCount(command, result)}</span>
            </div>
            {typeof (result as Record<string, unknown>).tokenizer_source === 'string' && (
              <div className="result-row compact">
                <strong>{t('nlp.tokenizer')}</strong>
                <span className="muted">{(result as Record<string, unknown>).tokenizer_source as string}</span>
              </div>
            )}
            {renderPreview(command, result, documents, t)}
          </div>
        )}
      </div>
    </section>
  );
}

export default NlpPanel;
