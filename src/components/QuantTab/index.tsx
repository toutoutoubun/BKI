import { Download, Play, Plus, Trash2 } from 'lucide-react';
import { useMemo } from 'react';
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
import { useAnalysisStore } from '../../store/analysisStore';
import type { CorpusDocument } from '../../types';
import NlpPanel from './NlpPanel';
import TextMiningPanel from './TextMiningPanel';

interface Props {
  documents: CorpusDocument[];
}

const colors = ['#226f54', '#2f6fed', '#b55b18', '#8a4f9e', '#ba3b46', '#597245'];

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
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
  const keywordGroups = useAnalysisStore((state) => state.keywordGroups);
  const frequencyResult = useAnalysisStore((state) => state.frequencyResult);
  const groupBy = useAnalysisStore((state) => state.groupBy);
  const isRunning = useAnalysisStore((state) => state.isRunning);
  const error = useAnalysisStore((state) => state.error);
  const setGroupBy = useAnalysisStore((state) => state.setGroupBy);
  const addKeywordGroup = useAnalysisStore((state) => state.addKeywordGroup);
  const updateKeywordGroup = useAnalysisStore((state) => state.updateKeywordGroup);
  const removeKeywordGroup = useAnalysisStore((state) => state.removeKeywordGroup);
  const runFrequency = useAnalysisStore((state) => state.runFrequency);

  const chartData = useMemo(() => {
    if (!frequencyResult) return [];
    return frequencyResult.periods.map((period) => {
      const row: Record<string, string | number> = { period };
      for (const group of frequencyResult.groups) row[group] = frequencyResult.counts[group]?.[period] ?? 0;
      return row;
    });
  }, [frequencyResult]);

  return (
    <div className="work-grid">
      <section className="panel">
        <div className="panel-header">
          <h2 className="section-title">{t('quant.frequency')}</h2>
          <div className="toolbar">
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
      <TextMiningPanel documents={documents} />
      <NlpPanel documents={documents} />
    </div>
  );
}

export default QuantTab;
