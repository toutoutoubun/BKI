import { Download } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAnalysisStore } from '../../store/analysisStore';
import { useCodingStore } from '../../store/codingStore';
import type { CorpusDocument } from '../../types';

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

function ExportTab({ documents }: Props) {
  const { t } = useTranslation();
  const [stellarPath, setStellarPath] = useState('~/Documents/BKI/Stellar');
  const codes = useCodingStore((state) => state.codes);
  const annotations = useCodingStore((state) => state.annotations);
  const frequencyResult = useAnalysisStore((state) => state.frequencyResult);
  const keywordGroups = useAnalysisStore((state) => state.keywordGroups);

  const exportProject = () => {
    downloadText(
      'bki-project.bki',
      JSON.stringify(
        {
          version: '0.1.0',
          exported_at: new Date().toISOString(),
          documents,
          codes,
          annotations,
          analysis: {
            keywordGroups,
            frequencyResult,
            stellarPath,
          },
        },
        null,
        2,
      ),
      'application/json;charset=utf-8',
    );
  };

  const exportCsv = () => {
    const rows = frequencyResult?.table ?? [];
    if (rows.length) downloadText('bki-frequency.csv', toCsv(rows), 'text/csv;charset=utf-8');
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
            <button className="primary-button" type="button" onClick={exportProject}>
              <Download size={17} />
              {t('export.downloadProject')}
            </button>
          </div>
          <div className="result-row">
            <strong>{t('export.csv')}</strong>
            <span className="muted">{frequencyResult?.table?.length ?? 0} {t('preprocess.status')}</span>
            <button className="ghost-button" type="button" disabled={!frequencyResult?.table?.length} onClick={exportCsv}>
              <Download size={17} />
              {t('export.downloadCsv')}
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
          {!frequencyResult && <div className="empty-state">{t('export.noResult')}</div>}
        </div>
      </section>
    </div>
  );
}

export default ExportTab;

