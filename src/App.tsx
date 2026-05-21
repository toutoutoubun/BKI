import { Activity, BarChart3, BookOpen, FileDown, FlaskConical, Languages, Settings, Tags } from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import CorpusPanel from './components/CorpusPanel';
import PersistenceBridge from './components/PersistenceBridge';
import { loadAddonLocales } from './lib/languageAddons';
import { useCorpusStore } from './store/corpusStore';
import { useProcessStore } from './store/processStore';

type TabId = 'preprocess' | 'qualitative' | 'quantitative' | 'export';

const AboutModal = lazy(() => import('./components/AboutModal'));
const ExportTab = lazy(() => import('./components/ExportTab'));
const GuideModal = lazy(() => import('./components/GuideModal'));
const ProcessInspector = lazy(() => import('./components/ProcessInspector'));
const PreprocessTab = lazy(() => import('./components/PreprocessTab'));
const QdaTab = lazy(() => import('./components/QdaTab'));
const QuantTab = lazy(() => import('./components/QuantTab'));

const tabIcons = {
  preprocess: FlaskConical,
  qualitative: Tags,
  quantitative: BarChart3,
  export: FileDown,
};

const baseInterfaceLanguages = [
  { code: 'ja', name: '日本語' },
  { code: 'en', name: 'English' },
  { code: 'fr', name: 'Français' },
  { code: 'af', name: 'Afrikaans' },
];

function LoadingPane({ label }: { label: string }) {
  return (
    <div className="empty-state" aria-live="polite">
      {label}
    </div>
  );
}

function App() {
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabId>('preprocess');
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(() => localStorage.getItem('bki.guide.seen') !== 'true');
  const [interfaceLanguages, setInterfaceLanguages] = useState(baseInterfaceLanguages);
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

  const selectedDocuments = useMemo(() => documents.filter((doc) => selectedIds.includes(doc.id)), [documents, selectedIds]);
  const activeDocuments = selectedDocuments.length ? selectedDocuments : documents;

  const changeLanguage = async (language: string) => {
    localStorage.setItem('bki.language', language);
    await i18n.changeLanguage(language);
  };

  useEffect(() => {
    let isMounted = true;
    loadAddonLocales().then((catalog) => {
      if (!isMounted || !catalog.locales.length) return;

      const addonLanguages = catalog.locales
        .filter((locale) => locale.code && locale.translation && typeof locale.translation === 'object')
        .map((locale) => {
          i18n.addResourceBundle(locale.code, 'translation', locale.translation, true, true);
          return { code: locale.code, name: locale.name || locale.code.toUpperCase() };
        })
        .filter((locale) => !baseInterfaceLanguages.some((base) => base.code === locale.code));

      if (addonLanguages.length) {
        setInterfaceLanguages([...baseInterfaceLanguages, ...addonLanguages]);
      }

      const storedLanguage = localStorage.getItem('bki.language');
      if (storedLanguage && addonLanguages.some((locale) => locale.code === storedLanguage)) {
        void i18n.changeLanguage(storedLanguage);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [i18n]);

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
              {interfaceLanguages.map((language) => (
                <option key={language.code} value={language.code}>
                  {language.name}
                </option>
              ))}
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
            <Suspense fallback={<LoadingPane label={t('common.loading')} />}>
              {activeTab === 'preprocess' && <PreprocessTab documents={activeDocuments} />}
              {activeTab === 'qualitative' && <QdaTab documents={activeDocuments} />}
              {activeTab === 'quantitative' && <QuantTab documents={activeDocuments} />}
              {activeTab === 'export' && <ExportTab documents={documents} />}
            </Suspense>
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
      <Suspense fallback={null}>
        {isProcessOpen && <ProcessInspector />}
        {isGuideOpen && <GuideModal onClose={closeGuide} />}
        {isAboutOpen && <AboutModal onClose={() => setIsAboutOpen(false)} />}
      </Suspense>
    </div>
  );
}

export default App;
