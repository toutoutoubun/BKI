import { invoke } from '@tauri-apps/api/core';
import { Brain, Play } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CorpusDocument } from '../../types';

type NlpCommand = 'ner' | 'topic_model' | 'similarity' | 'pos' | 'dependency' | 'lexical_stats';

interface Props {
  documents: CorpusDocument[];
}

const entityTypes = ['PERSON', 'ORG', 'GPE', 'DATE'];
const posTags = ['NOUN', 'VERB', 'ADJ', 'ADV'];

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

function renderPreview(command: NlpCommand, result: unknown, t: (key: string) => string) {
  const data = result as Record<string, any>;
  if (command === 'ner') {
    return (data.entities ?? []).slice(0, 8).map((entity: any) => (
      <div className="result-row compact" key={`${entity.document_id}-${entity.start}-${entity.text}`}>
        <strong>{entity.text}</strong>
        <span className="muted">{entity.label} · {entity.date ?? t('common.none')}</span>
      </div>
    ));
  }
  if (command === 'topic_model') {
    return (data.topics ?? []).slice(0, 6).map((topic: any) => (
      <div className="result-row compact" key={topic.id}>
        <strong>{t('nlp.topic')} {topic.id + 1}</strong>
        <span className="muted">{(topic.top_words ?? []).map((word: any) => word.word).join(', ')}</span>
      </div>
    ));
  }
  if (command === 'similarity') {
    return (data.ranked ?? []).slice(0, 8).map((item: any) => (
      <div className="result-row compact" key={item.document_id}>
        <strong>{item.document_id}</strong>
        <span className="muted">{t('nlp.score')}: {Number(item.score).toFixed(3)}</span>
      </div>
    ));
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
  const [command, setCommand] = useState<NlpCommand>('ner');
  const [language, setLanguage] = useState('en');
  const [selectedEntities, setSelectedEntities] = useState(entityTypes);
  const [selectedPosTags, setSelectedPosTags] = useState(posTags);
  const [topicCount, setTopicCount] = useState(5);
  const [targetEntity, setTargetEntity] = useState('');
  const [queryDocumentId, setQueryDocumentId] = useState('');
  const [result, setResult] = useState<unknown>();
  const [error, setError] = useState<string>();
  const [isRunning, setIsRunning] = useState(false);

  const activeDocumentId = useMemo(() => queryDocumentId || documents[0]?.id || '', [documents, queryDocumentId]);

  const payload = () => {
    const base = { documents, language };
    if (command === 'ner') return { ...base, entity_types: selectedEntities, group_by: 'month' };
    if (command === 'topic_model') return { ...base, method: 'nmf', n_topics: topicCount, n_words: 10, metadata_field: 'month' };
    if (command === 'similarity') return { ...base, method: 'tfidf_cosine', query_document_id: activeDocumentId, n_clusters: Math.min(4, Math.max(1, documents.length)) };
    if (command === 'pos') return { ...base, group_by: 'month', pos_tags: selectedPosTags };
    if (command === 'dependency') return { ...base, target_entity: targetEntity };
    return base;
  };

  const run = async () => {
    setIsRunning(true);
    setError(undefined);
    try {
      const response = await invoke('run_python', { command, payload: payload() });
      setResult(response);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setResult(undefined);
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

  return (
    <section className="panel span-all">
      <div className="panel-header">
        <h2 className="section-title">{t('nlp.title')}</h2>
        <button className="primary-button" type="button" disabled={isRunning || documents.length === 0} onClick={() => void run()}>
          <Play size={17} />
          {t('common.run')}
        </button>
      </div>
      <div className="panel-body">
        <div className="nlp-grid">
          <label className="field">
            <span>{t('nlp.analysis')}</span>
            <select className="select-input" value={command} onChange={(event) => setCommand(event.target.value as NlpCommand)}>
              <option value="ner">{t('nlp.ner')}</option>
              <option value="topic_model">{t('nlp.topicModel')}</option>
              <option value="similarity">{t('nlp.similarity')}</option>
              <option value="pos">{t('nlp.pos')}</option>
              <option value="dependency">{t('nlp.dependency')}</option>
              <option value="lexical_stats">{t('nlp.lexicalStats')}</option>
            </select>
          </label>
          <label className="field">
            <span>{t('corpus.language')}</span>
            <select className="select-input" value={language} onChange={(event) => setLanguage(event.target.value)}>
              <option value="en">English</option>
              <option value="ja">日本語</option>
              <option value="fr">Français</option>
              <option value="af">Afrikaans</option>
            </select>
          </label>
          {command === 'topic_model' && (
            <label className="field">
              <span>{t('nlp.topicCount')}</span>
              <input className="text-input" type="range" min={2} max={20} value={topicCount} onChange={(event) => setTopicCount(Number(event.target.value))} />
              <span className="muted">{topicCount}</span>
            </label>
          )}
          {command === 'similarity' && (
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
          )}
          {command === 'dependency' && (
            <label className="field">
              <span>{t('nlp.targetEntity')}</span>
              <input className="text-input" value={targetEntity} onChange={(event) => setTargetEntity(event.target.value)} />
            </label>
          )}
        </div>

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

        {error && <div className="muted">{t('nlp.pythonRequired')}</div>}
        {!result && !error && <div className="empty-state"><Brain size={20} />{t('nlp.noResult')}</div>}
        {result !== undefined && result !== null && (
          <div className="nlp-result">
            <div className="result-row compact">
              <strong>{t('nlp.resultCount')}</strong>
              <span className="muted">{resultCount(command, result)}</span>
            </div>
            {renderPreview(command, result, t)}
          </div>
        )}
      </div>
    </section>
  );
}

export default NlpPanel;
