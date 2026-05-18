import { FlaskConical } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CorpusDocument } from '../../types';

interface Props {
  documents: CorpusDocument[];
}

function PreprocessTab({ documents }: Props) {
  const { t } = useTranslation();
  const [options, setOptions] = useState({
    normalize: true,
    lowercase: false,
    punctuation: true,
    stopwords: false,
    stemming: false,
  });
  const [status, setStatus] = useState<string>('');

  const totalCharacters = useMemo(() => documents.reduce((sum, doc) => sum + doc.content.length, 0), [documents]);

  const toggle = (key: keyof typeof options) => setOptions((current) => ({ ...current, [key]: !current[key] }));

  return (
    <div className="work-grid">
      <section className="panel">
        <div className="panel-header">
          <h2 className="section-title">{t('preprocess.title')}</h2>
          <button className="primary-button" type="button" onClick={() => setStatus(new Date().toLocaleTimeString())}>
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
            <strong>{status || t('common.none')}</strong>
          </div>
        </div>
      </section>
    </div>
  );
}

export default PreprocessTab;

