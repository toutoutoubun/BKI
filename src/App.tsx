import { BarChart3, FileDown, FlaskConical, Languages, Settings, Tags } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AboutModal from './components/AboutModal';
import CorpusPanel from './components/CorpusPanel';
import ExportTab from './components/ExportTab';
import PreprocessTab from './components/PreprocessTab';
import QdaTab from './components/QdaTab';
import QuantTab from './components/QuantTab';
import { useCorpusStore } from './store/corpusStore';

type TabId = 'preprocess' | 'qualitative' | 'quantitative' | 'export';

const tabIcons = {
  preprocess: FlaskConical,
  qualitative: Tags,
  quantitative: BarChart3,
  export: FileDown,
};

function App() {
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabId>('preprocess');
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const documents = useCorpusStore((state) => state.documents);
  const selectedIds = useCorpusStore((state) => state.selectedIds);

  const tabs = useMemo(
    () =>
      [
        { id: 'preprocess', label: t('tabs.preprocess') },
        { id: 'qualitative', label: t('tabs.qualitative') },
        { id: 'quantitative', label: t('tabs.quantitative') },
        { id: 'export', label: t('tabs.export') },
      ] satisfies Array<{ id: TabId; label: string }>,
    [t],
  );

  const selectedDocuments = documents.filter((doc) => selectedIds.includes(doc.id));
  const activeDocuments = selectedDocuments.length ? selectedDocuments : documents;

  const changeLanguage = async (language: string) => {
    localStorage.setItem('bki.language', language);
    await i18n.changeLanguage(language);
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <strong>{t('app.name')}</strong>
          <span>{t('app.tagline')}</span>
        </div>
        <div className="header-actions">
          <button className="icon-button" type="button" title={t('app.settings')} onClick={() => setIsAboutOpen(true)}>
            <Settings size={18} />
          </button>
          <label className="language-picker">
            <Languages size={17} />
            <select value={i18n.language} onChange={(event) => void changeLanguage(event.target.value)}>
              <option value="ja">日本語</option>
              <option value="en">English</option>
              <option value="fr">Français</option>
              <option value="af">Afrikaans</option>
            </select>
          </label>
        </div>
      </header>

      <main className="workspace">
        <CorpusPanel />
        <section className="main-pane">
          <nav className="tab-strip" aria-label={t('app.tabs')}>
            {tabs.map((tab) => {
              const Icon = tabIcons[tab.id];
              return (
                <button
                  key={tab.id}
                  className={activeTab === tab.id ? 'tab-button active' : 'tab-button'}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                >
                  <Icon size={17} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="tab-content">
            {activeTab === 'preprocess' && <PreprocessTab documents={activeDocuments} />}
            {activeTab === 'qualitative' && <QdaTab documents={activeDocuments} />}
            {activeTab === 'quantitative' && <QuantTab documents={activeDocuments} />}
            {activeTab === 'export' && <ExportTab documents={documents} />}
          </div>
        </section>
      </main>
      {isAboutOpen && <AboutModal onClose={() => setIsAboutOpen(false)} />}
    </div>
  );
}

export default App;
