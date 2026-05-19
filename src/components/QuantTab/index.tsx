import { Download, Play, Plus, RefreshCw, Save, Trash2, Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { deleteAnalysisConfig, listAnalysisConfigs, saveAnalysisConfig, type AnalysisConfigRecord } from '../../lib/analysisConfigs';
import { useAnalysisStore } from '../../store/analysisStore';
import { useProcessStore } from '../../store/processStore';
import type { CorpusDocument, KeywordGroup } from '../../types';
import NlpPanel from './NlpPanel';
import TextMiningPanel from './TextMiningPanel';

interface Props {
  documents: CorpusDocument[];
}

type FrequencyGroupBy = 'month' | 'year' | 'document' | 'category';

interface FrequencyPresetConfig {
  keywordGroups: Array<Pick<KeywordGroup, 'name' | 'terms'>>;
  groupBy: FrequencyGroupBy;
}

const colors = ['#226f54', '#2f6fed', '#b55b18', '#8a4f9e', '#ba3b46', '#597245'];
const maxVisibleDispersionHits = 900;
const frequencyPresetType = 'frequency_preset';
const groupByOptions: FrequencyGroupBy[] = ['month', 'year', 'document', 'category'];

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadText(filename: string, content: string, type: string) {
  downloadBlob(filename, new Blob([content], { type }));
}

function toCsv(rows: Array<Record<string, string | number>>) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
  return [headers.join(','), ...rows.map((row) => headers.map((header) => escape(row[header] ?? '')).join(','))].join('\n');
}

function parseCsvRows(content: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];
    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      row.push(cell.trim());
      cell = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function parseKeywordGroupsCsv(content: string) {
  const rows = parseCsvRows(content);
  if (!rows.length) return [];
  const header = rows[0].map((cell) => cell.toLowerCase());
  const hasHeader = header.includes('group') || header.includes('name') || header.includes('terms');
  const groupIndex = hasHeader ? Math.max(header.indexOf('group'), header.indexOf('name')) : 0;
  const termsIndex = hasHeader ? header.indexOf('terms') : 1;

  return rows.slice(hasHeader ? 1 : 0).flatMap((row, index) => {
    const name = row[groupIndex] || `Group ${index + 1}`;
    const rawTerms = termsIndex >= 0 ? row[termsIndex] : row.slice(1).join(';');
    const terms = rawTerms
      .split(/[;,]/)
      .map((term) => term.trim())
      .filter(Boolean);
    return terms.length ? [{ name, terms }] : [];
  });
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function exportChartPng() {
  const svg = document.querySelector('#frequency-chart svg');
  if (!svg) return;
  const xml = new XMLSerializer().serializeToString(svg);
  const image = new Image();
  const svgBlob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = reject;
    image.src = url;
  });

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(960, image.width);
  canvas.height = Math.max(520, image.height);
  const context = canvas.getContext('2d');
  if (!context) return;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(url);

  canvas.toBlob((blob) => {
    if (blob) downloadBlob('bki-frequency.png', blob);
  });
}

function QuantTab({ documents }: Props) {
  const { t } = useTranslation();
  const keywordInputRef = useRef<HTMLInputElement>(null);
  const [keywordImportMessage, setKeywordImportMessage] = useState('');
  const [presetName, setPresetName] = useState('');
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [presets, setPresets] = useState<Array<AnalysisConfigRecord<FrequencyPresetConfig>>>([]);
  const [presetMessage, setPresetMessage] = useState('');
  const [isPresetBusy, setIsPresetBusy] = useState(false);
  const keywordGroups = useAnalysisStore((state) => state.keywordGroups);
  const frequencyResult = useAnalysisStore((state) => state.frequencyResult);
  const groupBy = useAnalysisStore((state) => state.groupBy);
  const isRunning = useAnalysisStore((state) => state.isRunning);
  const error = useAnalysisStore((state) => state.error);
  const setGroupBy = useAnalysisStore((state) => state.setGroupBy);
  const addKeywordGroup = useAnalysisStore((state) => state.addKeywordGroup);
  const replaceKeywordGroups = useAnalysisStore((state) => state.replaceKeywordGroups);
  const updateKeywordGroup = useAnalysisStore((state) => state.updateKeywordGroup);
  const removeKeywordGroup = useAnalysisStore((state) => state.removeKeywordGroup);
  const runFrequency = useAnalysisStore((state) => state.runFrequency);
  const addLog = useProcessStore((state) => state.addLog);
  const selectedPreset = presets.find((preset) => preset.id === selectedPresetId);

  const chartData = useMemo(() => {
    if (!frequencyResult) return [];
    return frequencyResult.periods.map((period) => {
      const row: Record<string, string | number> = { period };
      for (const group of frequencyResult.groups) row[group] = frequencyResult.counts[group]?.[period] ?? 0;
      return row;
    });
  }, [frequencyResult]);

  const dispersionGroups = useMemo(
    () =>
      keywordGroups
        .map((group, index) => ({
          ...group,
          color: colors[index % colors.length],
          terms: group.terms.map((term) => term.trim()).filter(Boolean),
        }))
        .filter((group) => group.terms.length > 0),
    [keywordGroups],
  );

  const dispersionRows = useMemo(
    () =>
      documents.map((document) => {
        const hits = dispersionGroups.flatMap((group) =>
          group.terms.flatMap((term) => {
            const matcher = new RegExp(escapeRegExp(term), 'giu');
            return [...document.content.matchAll(matcher)].map((match) => ({
              documentId: document.id,
              documentName: document.filename,
              groupName: group.name,
              term,
              offset: match.index ?? 0,
              position: document.content.length ? ((match.index ?? 0) / document.content.length) * 100 : 0,
              color: group.color,
            }));
          }),
        );
        return { document, hits };
      }),
    [documents, dispersionGroups],
  );

  const dispersionHitCount = useMemo(
    () => dispersionRows.reduce((sum, row) => sum + row.hits.length, 0),
    [dispersionRows],
  );

  const refreshPresets = async () => {
    setIsPresetBusy(true);
    const records = await listAnalysisConfigs<FrequencyPresetConfig>(frequencyPresetType);
    setPresets(records);
    setSelectedPresetId((current) => (records.some((preset) => preset.id === current) ? current : (records[0]?.id ?? '')));
    setIsPresetBusy(false);
  };

  useEffect(() => {
    void refreshPresets();
  }, []);

  const savePreset = async () => {
    const name = presetName.trim() || selectedPreset?.name || t('quant.defaultPresetName');
    const config: FrequencyPresetConfig = {
      keywordGroups: keywordGroups.map((group) => ({
        name: group.name,
        terms: group.terms,
      })),
      groupBy,
    };
    setIsPresetBusy(true);
    const record = await saveAnalysisConfig(frequencyPresetType, name, config, selectedPresetId || undefined);
    const updated = await listAnalysisConfigs<FrequencyPresetConfig>(frequencyPresetType);
    setPresets(updated);
    setSelectedPresetId(record.id);
    setPresetName(record.name);
    setPresetMessage(t('quant.presetSaveSuccess', { name: record.name }));
    addLog({
      level: 'success',
      stage: 'analysis.presets',
      title: 'Frequency preset saved',
      detail: record.name,
      data: {
        presetId: record.id,
        groupBy,
        keywordGroupCount: config.keywordGroups.length,
      },
    });
    setIsPresetBusy(false);
  };

  const applyPreset = () => {
    if (!selectedPreset) return;
    const config = selectedPreset.config;
    if (!config?.keywordGroups?.length) return;
    replaceKeywordGroups(config.keywordGroups);
    setGroupBy(groupByOptions.includes(config.groupBy) ? config.groupBy : 'month');
    setPresetName(selectedPreset.name);
    setPresetMessage(t('quant.presetLoadSuccess', { name: selectedPreset.name }));
    addLog({
      level: 'success',
      stage: 'analysis.presets',
      title: 'Frequency preset applied',
      detail: selectedPreset.name,
      data: {
        presetId: selectedPreset.id,
        groupBy: config.groupBy,
        keywordGroupCount: config.keywordGroups.length,
      },
    });
  };

  const deletePreset = async () => {
    if (!selectedPreset) return;
    setIsPresetBusy(true);
    await deleteAnalysisConfig(selectedPreset.id);
    const updated = await listAnalysisConfigs<FrequencyPresetConfig>(frequencyPresetType);
    setPresets(updated);
    setSelectedPresetId(updated[0]?.id ?? '');
    setPresetName('');
    setPresetMessage(t('quant.presetDeleteSuccess', { name: selectedPreset.name }));
    addLog({
      level: 'success',
      stage: 'analysis.presets',
      title: 'Frequency preset deleted',
      detail: selectedPreset.name,
      data: { presetId: selectedPreset.id },
    });
    setIsPresetBusy(false);
  };

  const exportDispersionCsv = () => {
    const rows = dispersionRows.flatMap((row) =>
      row.hits.map((hit) => ({
        document: row.document.filename,
        group: hit.groupName,
        term: hit.term,
        offset: hit.offset,
        position_percent: Number(hit.position.toFixed(2)),
      })),
    );
    if (!rows.length) return;
    downloadText('bki-dispersion.csv', toCsv(rows), 'text/csv;charset=utf-8');
    addLog({
      level: 'success',
      stage: 'analysis.dispersion',
      title: 'Dispersion plot data exported',
      detail: `${rows.length} keyword occurrence(s) were exported to CSV.`,
      data: {
        documentCount: documents.length,
        groupCount: dispersionGroups.length,
        hitCount: rows.length,
      },
    });
  };

  const exportKeywordGroupsCsv = () => {
    if (!keywordGroups.length) return;
    const rows = keywordGroups.map((group) => ({
      group: group.name,
      terms: group.terms.join('; '),
    }));
    downloadText('bki-keyword-groups.csv', toCsv(rows), 'text/csv;charset=utf-8');
    addLog({
      level: 'success',
      stage: 'analysis.keywords',
      title: 'Keyword groups exported',
      detail: `${rows.length} keyword group(s) were exported to CSV.`,
      data: { groupCount: rows.length },
    });
  };

  const importKeywordGroupsCsv = async (file: File) => {
    setKeywordImportMessage('');
    try {
      const groups = parseKeywordGroupsCsv(await file.text());
      if (!groups.length) throw new Error('No keyword groups found.');
      replaceKeywordGroups(groups);
      setKeywordImportMessage(t('quant.importGroupsSuccess', { count: groups.length }));
      addLog({
        level: 'success',
        stage: 'analysis.keywords',
        title: 'Keyword groups imported',
        detail: `${groups.length} keyword group(s) were imported from ${file.name}.`,
        data: {
          filename: file.name,
          groupCount: groups.length,
          termCount: groups.reduce((sum, group) => sum + group.terms.length, 0),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setKeywordImportMessage(t('quant.importGroupsError'));
      addLog({
        level: 'error',
        stage: 'analysis.keywords',
        title: 'Keyword group import failed',
        detail: message,
      });
    }
  };

  return (
    <div className="work-grid">
      <section className="panel">
        <div className="panel-header">
          <h2 className="section-title">{t('quant.frequency')}</h2>
          <div className="toolbar">
            <button className="ghost-button" type="button" onClick={() => keywordInputRef.current?.click()}>
              <Upload size={17} />
              {t('quant.importGroups')}
            </button>
            <button className="ghost-button" type="button" disabled={!keywordGroups.length} onClick={exportKeywordGroupsCsv}>
              <Download size={17} />
              {t('quant.exportGroups')}
            </button>
            <button className="ghost-button" type="button" onClick={addKeywordGroup}>
              <Plus size={17} />
              {t('quant.addGroup')}
            </button>
            <button className="primary-button" type="button" disabled={isRunning || documents.length === 0} onClick={() => void runFrequency(documents)}>
              <Play size={17} />
              {t('quant.runAnalysis')}
            </button>
          </div>
        </div>
        <div className="panel-body">
          <input
            ref={keywordInputRef}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importKeywordGroupsCsv(file);
              event.currentTarget.value = '';
            }}
          />
          {keywordImportMessage && <span className="muted">{keywordImportMessage}</span>}
          <div className="result-row">
            <strong>{t('quant.presets')}</strong>
            <div className="field-grid">
              <label className="field">
                <span>{t('quant.presetName')}</span>
                <input className="text-input" value={presetName} placeholder={selectedPreset?.name ?? t('quant.defaultPresetName')} onChange={(event) => setPresetName(event.target.value)} />
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
              <button className="primary-button" type="button" disabled={isPresetBusy || keywordGroups.length === 0} onClick={() => void savePreset()}>
                <Save size={17} />
                {t('quant.savePreset')}
              </button>
            </div>
            {presetMessage && <span className="muted">{presetMessage}</span>}
          </div>
          <label className="field">
            <span>{t('quant.groupBy')}</span>
            <select className="select-input" value={groupBy} onChange={(event) => setGroupBy(event.target.value as typeof groupBy)}>
              <option value="month">{t('quant.groupByMonth')}</option>
              <option value="year">{t('quant.groupByYear')}</option>
              <option value="document">{t('quant.groupByDocument')}</option>
              <option value="category">{t('quant.groupByCategory')}</option>
            </select>
          </label>

          {keywordGroups.map((group) => (
            <div className="keyword-row" key={group.id}>
              <label className="field">
                <span>{t('quant.groupName')}</span>
                <input className="text-input" value={group.name} onChange={(event) => updateKeywordGroup(group.id, { name: event.target.value })} />
              </label>
              <label className="field">
                <span>{t('quant.terms')}</span>
                <input
                  className="text-input"
                  value={group.terms.join(', ')}
                  onChange={(event) =>
                    updateKeywordGroup(group.id, {
                      terms: event.target.value
                        .split(',')
                        .map((term) => term.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </label>
              <button className="icon-button" type="button" title={t('common.delete')} onClick={() => removeKeywordGroup(group.id)}>
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2 className="section-title">{t('quant.chart')}</h2>
          <button className="ghost-button" type="button" disabled={!frequencyResult} onClick={() => void exportChartPng()}>
            <Download size={17} />
            {t('quant.exportPng')}
          </button>
        </div>
        <div className="panel-body">
          {error && <div className="muted">{t('quant.pythonFallback')}</div>}
          {!frequencyResult && <div className="empty-state">{t('quant.noData')}</div>}
          {frequencyResult && (
            <div className="chart-wrap" id="frequency-chart">
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={chartData} margin={{ top: 12, right: 24, bottom: 12, left: 0 }}>
                  <CartesianGrid stroke="#e2e7de" />
                  <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  {frequencyResult.groups.map((group, index) => (
                    <Line key={group} type="monotone" dataKey={group} stroke={colors[index % colors.length]} strokeWidth={2} dot={{ r: 3 }} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </section>
      <section className="panel span-all">
        <div className="panel-header">
          <h2 className="section-title">{t('quant.dispersion')}</h2>
          <button className="ghost-button" type="button" disabled={dispersionHitCount === 0} onClick={exportDispersionCsv}>
            <Download size={17} />
            {t('quant.exportDispersionCsv')}
          </button>
        </div>
        <div className="panel-body">
          {documents.length === 0 || dispersionGroups.length === 0 ? (
            <div className="empty-state">{t('quant.noDispersionData')}</div>
          ) : (
            <>
              <div className="dispersion-summary">
                <span className="muted">{t('quant.dispersionSummary', { count: dispersionHitCount, documents: documents.length })}</span>
                <div className="dispersion-legend">
                  {dispersionGroups.map((group) => (
                    <span className="legend-item" key={group.id}>
                      <span className="legend-swatch" style={{ backgroundColor: group.color }} />
                      {group.name}
                    </span>
                  ))}
                </div>
              </div>
              {dispersionHitCount === 0 ? (
                <div className="empty-state">{t('quant.noDispersionHits')}</div>
              ) : (
                <div className="dispersion-plot" role="img" aria-label={t('quant.dispersion')}>
                  {dispersionRows.map((row) => {
                    const visibleHits = row.hits.slice(0, maxVisibleDispersionHits);
                    return (
                      <div className="dispersion-row" key={row.document.id}>
                        <div className="dispersion-label">
                          <strong>{row.document.filename}</strong>
                          <span className="muted">{row.hits.length} {t('quant.hits')}</span>
                        </div>
                        <div className="dispersion-track">
                          {visibleHits.map((hit, index) => (
                            <span
                              className="dispersion-hit"
                              key={`${hit.groupName}-${hit.term}-${hit.offset}-${index}`}
                              title={`${hit.groupName}: ${hit.term} (${Math.round(hit.position)}%)`}
                              style={{ left: `${hit.position}%`, backgroundColor: hit.color }}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </section>
      <TextMiningPanel documents={documents} />
      <NlpPanel documents={documents} />
    </div>
  );
}

export default QuantTab;
