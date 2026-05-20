import { invoke } from '@tauri-apps/api/core';
import { BrainCircuit, Download, Play, RefreshCw, Save, Trash2, Upload } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { deleteAnalysisConfig, listAnalysisConfigs, saveAnalysisConfig, type AnalysisConfigRecord } from '../../lib/analysisConfigs';
import { useAnalysisStore } from '../../store/analysisStore';
import { useProcessStore } from '../../store/processStore';
import type { CorpusDocument } from '../../types';

type MiningCommand = 'kwic' | 'cooccurrence' | 'tfidf' | 'sentiment';

interface Props {
  documents: CorpusDocument[];
}

interface TextMiningPresetConfig {
  command: MiningCommand;
  query: string;
  terms: string;
  windowSize: number;
  topN: number;
  lexiconText: string;
  groupBy: 'month' | 'year' | 'document' | 'category';
}

type CsvValue = string | number | boolean | null | undefined;

const textMiningPresetType = 'text_mining_preset';
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

function resultCount(command: MiningCommand, result: Record<string, any>) {
  if (command === 'kwic') return Array.isArray(result.results) ? result.results.length : 0;
  if (command === 'cooccurrence') return Array.isArray(result.edges) ? result.edges.length : 0;
  if (command === 'tfidf') return Array.isArray(result.results) ? result.results.length : 0;
  if (command === 'sentiment') return Object.keys(result.scores ?? {}).length;
  return 0;
}

function miningRows(command: MiningCommand, result: Record<string, any>): Array<Record<string, CsvValue>> {
  if (command === 'kwic') {
    return (result.results ?? []).map((hit: any) => ({
      section: 'kwic',
      document: hit.document_name,
      document_id: hit.document_id,
      date: hit.date ?? '',
      offset: hit.offset,
      left: hit.left,
      keyword: hit.keyword,
      right: hit.right,
    }));
  }

  if (command === 'cooccurrence') {
    return (result.edges ?? []).map((edge: any) => ({
      section: 'edges',
      source: edge.source,
      target: edge.target,
      weight: edge.weight,
    }));
  }

  if (command === 'tfidf') {
    return (result.results ?? []).flatMap((row: any) =>
      (row.terms ?? []).map((term: any, index: number) => ({
        section: 'terms',
        document: row.document_name,
        document_id: row.document_id,
        rank: index + 1,
        term: term.term,
        score: term.score,
      })),
    );
  }

  const scoreRows = Object.entries(result.scores ?? {}).flatMap(([target, scores]) =>
    Object.entries(scores as Record<string, number>).map(([period, score]) => ({
      section: 'scores',
      target,
      period,
      score,
    })),
  );
  const hitRows = Object.entries(result.hits ?? {}).flatMap(([target, periods]) =>
    Object.entries(periods as Record<string, Array<Record<string, CsvValue>>>).flatMap(([period, hits]) =>
      hits.map((hit) => ({
        section: 'hits',
        target,
        period,
        word: hit.word,
        score: hit.score,
        context: hit.context,
      })),
    ),
  );
  return [...scoreRows, ...hitRows];
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
  const setGroupBy = useAnalysisStore((state) => state.setGroupBy);
  const [command, setCommand] = useState<MiningCommand>('kwic');
  const [query, setQuery] = useState('');
  const [terms, setTerms] = useState('BKI, research, keyword');
  const [windowSize, setWindowSize] = useState(80);
  const [topN, setTopN] = useState(15);
  const [lexiconText, setLexiconText] = useState(defaultLexicon.map((item) => `${item.word}, ${item.score}`).join('\n'));
  const [result, setResult] = useState<Record<string, any>>();
  const [error, setError] = useState<string>();
  const [isRunning, setIsRunning] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [presets, setPresets] = useState<Array<AnalysisConfigRecord<TextMiningPresetConfig>>>([]);
  const [presetMessage, setPresetMessage] = useState('');
  const [isPresetBusy, setIsPresetBusy] = useState(false);

  const firstKeyword = useMemo(() => keywordGroups.flatMap((group) => group.terms)[0] ?? '', [keywordGroups]);
  const sentimentLanguage = useMemo(() => documents.find((document) => document.metadata.language)?.metadata.language ?? 'en', [documents]);
  const effectiveQuery = query.trim() || firstKeyword;
  const effectiveTerms = parseTerms(terms).length ? parseTerms(terms) : keywordGroups.flatMap((group) => group.terms).filter(Boolean);
  const selectedPreset = presets.find((preset) => preset.id === selectedPresetId);
  const exportRows = result ? miningRows(command, result) : [];

  const refreshPresets = async () => {
    setIsPresetBusy(true);
    const records = await listAnalysisConfigs<TextMiningPresetConfig>(textMiningPresetType);
    setPresets(records);
    setSelectedPresetId((current) => (records.some((preset) => preset.id === current) ? current : (records[0]?.id ?? '')));
    setIsPresetBusy(false);
  };

  useEffect(() => {
    void refreshPresets();
  }, []);

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

  const savePreset = async () => {
    const name = presetName.trim() || selectedPreset?.name || t('mining.defaultPresetName');
    const config: TextMiningPresetConfig = { command, query, terms, windowSize, topN, lexiconText, groupBy };
    setIsPresetBusy(true);
    const record = await saveAnalysisConfig(textMiningPresetType, name, config, selectedPresetId || undefined);
    const updated = await listAnalysisConfigs<TextMiningPresetConfig>(textMiningPresetType);
    setPresets(updated);
    setSelectedPresetId(record.id);
    setPresetName(record.name);
    setPresetMessage(t('quant.presetSaveSuccess', { name: record.name }));
    addLog({
      level: 'success',
      stage: 'mining.presets',
      title: 'Text mining preset saved',
      detail: record.name,
      data: { presetId: record.id, command, groupBy },
    });
    setIsPresetBusy(false);
  };

  const applyPreset = () => {
    if (!selectedPreset) return;
    const config = selectedPreset.config;
    setCommand(config.command ?? 'kwic');
    setQuery(config.query ?? '');
    setTerms(config.terms ?? '');
    setWindowSize(Number(config.windowSize) || 80);
    setTopN(Number(config.topN) || 15);
    setLexiconText(config.lexiconText ?? '');
    if (['month', 'year', 'document', 'category'].includes(config.groupBy)) setGroupBy(config.groupBy);
    setPresetName(selectedPreset.name);
    setPresetMessage(t('quant.presetLoadSuccess', { name: selectedPreset.name }));
    addLog({
      level: 'success',
      stage: 'mining.presets',
      title: 'Text mining preset applied',
      detail: selectedPreset.name,
      data: { presetId: selectedPreset.id, command: config.command, groupBy: config.groupBy },
    });
  };

  const deletePreset = async () => {
    if (!selectedPreset) return;
    setIsPresetBusy(true);
    await deleteAnalysisConfig(selectedPreset.id);
    const updated = await listAnalysisConfigs<TextMiningPresetConfig>(textMiningPresetType);
    setPresets(updated);
    setSelectedPresetId(updated[0]?.id ?? '');
    setPresetName('');
    setPresetMessage(t('quant.presetDeleteSuccess', { name: selectedPreset.name }));
    addLog({
      level: 'success',
      stage: 'mining.presets',
      title: 'Text mining preset deleted',
      detail: selectedPreset.name,
      data: { presetId: selectedPreset.id },
    });
    setIsPresetBusy(false);
  };

  const exportResultCsv = () => {
    if (!result || exportRows.length === 0) return;
    downloadText(`bki-text-mining-${command}.csv`, toCsv(exportRows), 'text/csv;charset=utf-8');
    addLog({
      level: 'success',
      stage: `mining.${command}`,
      title: 'Text mining result exported',
      detail: `${exportRows.length} row(s) were exported to CSV.`,
      data: { command, rowCount: exportRows.length },
    });
  };

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
        <div className="toolbar">
          <button className="ghost-button" type="button" disabled={!result || exportRows.length === 0} onClick={exportResultCsv}>
            <Download size={17} />
            {t('mining.exportCsv')}
          </button>
          <button className="primary-button" type="button" disabled={isRunning || !canRun} onClick={() => void run()}>
            <Play size={17} />
            {t('common.run')}
          </button>
        </div>
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

        <div className="result-row">
          <strong>{t('quant.presets')}</strong>
          <div className="field-grid">
            <label className="field">
              <span>{t('quant.presetName')}</span>
              <input className="text-input" value={presetName} placeholder={selectedPreset?.name ?? t('mining.defaultPresetName')} onChange={(event) => setPresetName(event.target.value)} />
            </label>
            <label className="field">
              <span>{t('quant.savedPresets')}</span>
              <select className="select-input" value={selectedPresetId} onChange={(event) => setSelectedPresetId(event.target.value)}>
                <option value="">{t('common.none')}</option>
                {presets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="toolbar">
            <button className="ghost-button" type="button" disabled={isPresetBusy} onClick={() => void refreshPresets()}>
              <RefreshCw size={17} />
              {t('quant.refreshPresets')}
            </button>
            <button className="ghost-button" type="button" disabled={!selectedPreset || isPresetBusy} onClick={applyPreset}>
              <Upload size={17} />
              {t('quant.loadPreset')}
            </button>
            <button className="ghost-button" type="button" disabled={!selectedPreset || isPresetBusy} onClick={() => void deletePreset()}>
              <Trash2 size={17} />
              {t('quant.deletePreset')}
            </button>
            <button className="primary-button" type="button" disabled={isPresetBusy} onClick={() => void savePreset()}>
              <Save size={17} />
              {t('quant.savePreset')}
            </button>
          </div>
          {presetMessage && <span className="muted">{presetMessage}</span>}
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
