import { invoke } from '@tauri-apps/api/core';
import { BrainCircuit, Play } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAnalysisStore } from '../../store/analysisStore';
import { useProcessStore } from '../../store/processStore';
import type { CorpusDocument } from '../../types';

type MiningCommand = 'kwic' | 'cooccurrence' | 'tfidf' | 'sentiment';

interface Props {
  documents: CorpusDocument[];
}

const defaultLexicon = [
  { word: 'good', score: 1 },
  { word: 'strong', score: 1 },
  { word: 'support', score: 1 },
  { word: 'bad', score: -1 },
  { word: 'weak', score: -1 },
  { word: 'risk', score: -1 },
];

function parseTerms(value: string) {
  return value
    .split(',')
    .map((term) => term.trim())
    .filter(Boolean);
}

function parseLexicon(value: string) {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [word, score = '0'] = line.split(',').map((item) => item.trim());
      return { word, score: Number(score) || 0 };
    })
    .filter((item) => item.word);
}

function resultCount(command: MiningCommand, result: Record<string, any>) {
  if (command === 'kwic') return Array.isArray(result.results) ? result.results.length : 0;
  if (command === 'cooccurrence') return Array.isArray(result.edges) ? result.edges.length : 0;
  if (command === 'tfidf') return Array.isArray(result.results) ? result.results.length : 0;
  if (command === 'sentiment') return Object.keys(result.scores ?? {}).length;
  return 0;
}

function renderResult(command: MiningCommand, result: Record<string, any>, t: (key: string) => string) {
  if (command === 'kwic') {
    return (
      <div className="table-wrap">
        <table className="analysis-table">
          <thead>
            <tr>
              <th>{t('qda.document')}</th>
              <th>{t('mining.left')}</th>
              <th>{t('mining.keyword')}</th>
              <th>{t('mining.right')}</th>
            </tr>
          </thead>
          <tbody>
            {(result.results ?? []).slice(0, 80).map((hit: any) => (
              <tr key={`${hit.document_id}-${hit.offset}`}>
                <td>{hit.document_name}</td>
                <td>{hit.left}</td>
                <td><strong>{hit.keyword}</strong></td>
                <td>{hit.right}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (command === 'cooccurrence') {
    return (
      <div className="nlp-result">
        {(result.edges ?? []).slice(0, 30).map((edge: any) => (
          <div className="result-row compact" key={`${edge.source}-${edge.target}`}>
            <strong>{edge.source} - {edge.target}</strong>
            <span className="muted">{t('mining.weight')}: {edge.weight}</span>
          </div>
        ))}
      </div>
    );
  }

  if (command === 'tfidf') {
    return (
      <div className="nlp-result">
        {(result.results ?? []).slice(0, 12).map((row: any) => (
          <div className="result-row compact" key={row.document_id}>
            <strong>{row.document_name}</strong>
            <span className="muted">
              {(row.terms ?? []).slice(0, 10).map((term: any) => `${term.term} ${Number(term.score).toFixed(3)}`).join(' · ')}
            </span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="nlp-result">
      {Object.entries(result.scores ?? {}).map(([target, scores]) => (
        <div className="result-row compact" key={target}>
          <strong>{target}</strong>
          <span className="muted">
            {Object.entries(scores as Record<string, number>).map(([period, score]) => `${period}: ${Number(score).toFixed(2)}`).join(' · ')}
          </span>
        </div>
      ))}
    </div>
  );
}

function TextMiningPanel({ documents }: Props) {
  const { t } = useTranslation();
  const addLog = useProcessStore((state) => state.addLog);
  const keywordGroups = useAnalysisStore((state) => state.keywordGroups);
  const groupBy = useAnalysisStore((state) => state.groupBy);
  const [command, setCommand] = useState<MiningCommand>('kwic');
  const [query, setQuery] = useState('');
  const [terms, setTerms] = useState('BKI, research, keyword');
  const [windowSize, setWindowSize] = useState(80);
  const [topN, setTopN] = useState(15);
  const [lexiconText, setLexiconText] = useState(defaultLexicon.map((item) => `${item.word}, ${item.score}`).join('\n'));
  const [result, setResult] = useState<Record<string, any>>();
  const [error, setError] = useState<string>();
  const [isRunning, setIsRunning] = useState(false);

  const firstKeyword = useMemo(() => keywordGroups.flatMap((group) => group.terms)[0] ?? '', [keywordGroups]);
  const sentimentLanguage = useMemo(() => documents.find((document) => document.metadata.language)?.metadata.language ?? 'en', [documents]);
  const effectiveQuery = query.trim() || firstKeyword;
  const effectiveTerms = parseTerms(terms).length ? parseTerms(terms) : keywordGroups.flatMap((group) => group.terms).filter(Boolean);

  const payload = () => {
    if (command === 'kwic') return { documents, query: effectiveQuery, window: windowSize, max_results: 200 };
    if (command === 'cooccurrence') return { documents, terms: effectiveTerms, window: windowSize };
    if (command === 'tfidf') return { documents, top_n: topN };
    const targetTerms = effectiveTerms.length ? effectiveTerms : [effectiveQuery].filter(Boolean);
    return {
      documents,
      targets: { [t('mining.defaultTarget')]: targetTerms },
      language: sentimentLanguage,
      lexicon: parseLexicon(lexiconText),
      window: windowSize,
      group_by: groupBy,
    };
  };

  const canRun = documents.length > 0 && (command === 'tfidf' || effectiveQuery || effectiveTerms.length > 0);

  const run = async () => {
    const requestPayload = payload();
    const startedAt = performance.now();
    setIsRunning(true);
    setError(undefined);
    addLog({
      level: 'info',
      stage: `mining.${command}`,
      title: 'Text mining command requested',
      detail: 'Sending corpus and text mining settings to the Python sidecar.',
      data: {
        command,
        documentCount: documents.length,
        windowSize,
        topN,
        language: command === 'sentiment' ? sentimentLanguage : undefined,
        lexiconMode: command === 'sentiment' && !parseLexicon(lexiconText).length ? 'language_addon' : 'manual',
      },
    });

    try {
      const response = await invoke<Record<string, any>>('run_python', {
        command,
        payload: requestPayload,
      });
      setResult(response);
      addLog({
        level: 'success',
        stage: `mining.${command}`,
        title: 'Text mining command completed',
        detail: `Completed in ${Math.round(performance.now() - startedAt)}ms.`,
        data: {
          resultCount: resultCount(command, response),
          fallback: Boolean(response.fallback),
        },
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
      setResult(undefined);
      addLog({
        level: 'error',
        stage: `mining.${command}`,
        title: 'Text mining command failed',
        detail: message,
      });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <section className="panel span-all">
      <div className="panel-header">
        <h2 className="section-title">{t('mining.title')}</h2>
        <button className="primary-button" type="button" disabled={isRunning || !canRun} onClick={() => void run()}>
          <Play size={17} />
          {t('common.run')}
        </button>
      </div>
      <div className="panel-body">
        <div className="nlp-grid">
          <label className="field">
            <span>{t('mining.analysis')}</span>
            <select className="select-input" value={command} onChange={(event) => setCommand(event.target.value as MiningCommand)}>
              <option value="kwic">{t('mining.kwic')}</option>
              <option value="cooccurrence">{t('quant.cooccurrence')}</option>
              <option value="tfidf">{t('quant.tfidf')}</option>
              <option value="sentiment">{t('quant.sentiment')}</option>
            </select>
          </label>
          {command === 'kwic' && (
            <label className="field">
              <span>{t('mining.query')}</span>
              <input className="text-input" value={query} placeholder={firstKeyword} onChange={(event) => setQuery(event.target.value)} />
            </label>
          )}
          {command !== 'kwic' && command !== 'tfidf' && (
            <label className="field">
              <span>{t('mining.terms')}</span>
              <input className="text-input" value={terms} onChange={(event) => setTerms(event.target.value)} />
            </label>
          )}
          <label className="field">
            <span>{command === 'tfidf' ? t('mining.topN') : t('mining.window')}</span>
            <input
              className="text-input"
              type="number"
              min={command === 'tfidf' ? 3 : 20}
              max={command === 'tfidf' ? 50 : 400}
              value={command === 'tfidf' ? topN : windowSize}
              onChange={(event) => (command === 'tfidf' ? setTopN(Number(event.target.value)) : setWindowSize(Number(event.target.value)))}
            />
          </label>
        </div>

        {command === 'sentiment' && (
          <label className="field">
            <span>{t('mining.lexicon')}</span>
            <textarea className="text-area" rows={5} value={lexiconText} onChange={(event) => setLexiconText(event.target.value)} />
            <div className="toolbar">
              <button className="ghost-button" type="button" onClick={() => setLexiconText('')}>
                {t('mining.useAddonLexicon')}
              </button>
              <button className="ghost-button" type="button" onClick={() => setLexiconText(defaultLexicon.map((item) => `${item.word}, ${item.score}`).join('\n'))}>
                {t('mining.useManualLexicon')}
              </button>
              <span className="muted">{t('mining.lexiconAddonHint', { language: sentimentLanguage.toUpperCase() })}</span>
            </div>
          </label>
        )}

        {error && <div className="muted">{error}</div>}
        {!result && !error && <div className="empty-state"><BrainCircuit size={20} />{t('mining.noResult')}</div>}
        {result && (
          <div className="nlp-result">
            <div className="result-row compact">
              <strong>{t('nlp.resultCount')}</strong>
              <span className="muted">{resultCount(command, result)}</span>
            </div>
            {command === 'sentiment' && (
              <div className="result-row compact">
                <strong>{t('mining.lexiconSource')}</strong>
                <span className="muted">
                  {result.lexicon_source === 'language_addon' ? t('mining.lexiconSourceAddon') : t('mining.lexiconSourceManual')} · {result.lexicon_size ?? 0}
                </span>
              </div>
            )}
            {renderResult(command, result, t)}
          </div>
        )}
      </div>
    </section>
  );
}

export default TextMiningPanel;
