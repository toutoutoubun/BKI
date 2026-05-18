import { invoke } from '@tauri-apps/api/core';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  onClose: () => void;
}

interface Credit {
  name: string;
  authors?: string;
  url?: string;
  license?: string;
  license_type?: 'open' | 'nc' | 'unknown';
  note?: string;
  citation?: string;
}

const fallbackCredits: Credit[] = [
  { name: 'spaCy', authors: 'Explosion AI', url: 'https://spacy.io', license: 'MIT', license_type: 'open' },
  { name: 'NLTK', authors: 'NLTK Project', url: 'https://nltk.org', license: 'Apache 2.0', license_type: 'open' },
  { name: 'scikit-learn', authors: 'scikit-learn developers', url: 'https://scikit-learn.org', license: 'BSD 3-Clause', license_type: 'open' },
  { name: 'Gensim', authors: 'RARE Technologies', url: 'https://radimrehurek.com/gensim', license: 'LGPL 2.1', license_type: 'open' },
];

function AboutModal({ onClose }: Props) {
  const { t } = useTranslation();
  const [credits, setCredits] = useState<Credit[]>(fallbackCredits);

  useEffect(() => {
    invoke<{ credits: Credit[] }>('run_python', { command: 'get_credits', payload: {} })
      .then((response) => setCredits(response.credits))
      .catch(() => setCredits(fallbackCredits));
  }, []);

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal wide" role="dialog" aria-modal="true" aria-label={t('about.title')}>
        <div className="panel-header">
          <h2 className="section-title">{t('about.title')}</h2>
          <button className="icon-button" type="button" title={t('common.cancel')} onClick={onClose}>
            <X size={17} />
          </button>
        </div>
        <div className="panel-body">
          <p className="muted">{t('about.creditsNote')}</p>
          <div className="credits-list">
            {credits.map((credit) => (
              <article className="credit-item" key={`${credit.name}-${credit.url ?? ''}`}>
                <div className="toolbar">
                  <strong>{credit.name}</strong>
                  {credit.license_type === 'nc' && <span className="badge nc" title={credit.note}>{t('about.nonCommercial')}</span>}
                  {credit.license_type === 'unknown' && <span className="badge unknown">{t('about.licenseUnknown')}</span>}
                </div>
                <div className="muted">
                  {credit.authors ?? t('common.none')} · {credit.license ?? t('common.none')}
                </div>
                {credit.url && (
                  <a className="credit-link" href={credit.url} target="_blank" rel="noreferrer">
                    {credit.url}
                  </a>
                )}
                {credit.citation && (
                  <details>
                    <summary>{t('about.bibtex')}</summary>
                    <pre>{credit.citation}</pre>
                  </details>
                )}
              </article>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default AboutModal;
