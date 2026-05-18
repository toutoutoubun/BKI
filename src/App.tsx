import { Activity, BarChart3, BookOpen, FileDown, FlaskConical, Languages, Settings, Tags } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AboutModal from './components/AboutModal';
import CorpusPanel from './components/CorpusPanel';
import ExportTab from './components/ExportTab';
import GuideModal from './components/GuideModal';
import PersistenceBridge from './components/PersistenceBridge';
import ProcessInspector from './components/ProcessInspector';
import PreprocessTab from './components/PreprocessTab';
import QdaTab from './components/QdaTab';
import QuantTab from './components/QuantTab';
import { useCorpusStore } from './store/corpusStore';
import { useProcessStore } from './store/processStore';

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
  const [isGuideOpen, setIsGuideOpen] = useState(() => localStorage.getItem('bki.guide.seen') !== 'true');
  const documents = useCorpusStore((state) => state.documents);
  const selectedIds = useCorpusStore((state) => state.selectedIds);
  const isProcessOpen = useProcessStore((state) => state.isOpen);
  const toggleProcessOpen = useProcessStore((state) => state.toggleOpen);

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

  const closeGuide = () => {
    localStorage.setItem('bki.guide.seen', 'true');
    setIsGuideOpen(false);
  };

  return (
    <div className="app-shell">
      <PersistenceBridge />
      <header className="app-header">
        <div className="brand">
          <strong>{t('app.name')}</strong>
        </div>
        <div className="header-actions">
          <button className="icon-button" type="button" title={t('guide.open')} onClick={() => setIsGuideOpen(true)}>
            <BookOpen size={18} />
          </button>
          <button
            className={isProcessOpen ? 'icon-button active' : 'icon-button'}
            type="button"
            title={t('process.open')}
            onClick={toggleProcessOpen}
          >
            <Activity size={18} />
          </button>
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
      <footer className="status-bar">
        <span>{t('status.localProject')}</span>
        <span>{documents.length} {t('status.documents')}</span>
        <span>{selectedIds.length} {t('status.selected')}</span>
        <span>{t('status.localOnly')}</span>
        {isProcessOpen && <span>{t('process.modeActive')}</span>}
      </footer>
      {isProcessOpen && <ProcessInspector />}
      {isGuideOpen && <GuideModal onClose={closeGuide} />}
      {isAboutOpen && <AboutModal onClose={() => setIsAboutOpen(false)} />}
    </div>
  );
}

export default App;
