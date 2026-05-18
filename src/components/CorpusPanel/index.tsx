import { Edit3, FileText, Search, Trash2, Upload } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCorpusStore } from '../../store/corpusStore';
import type { CorpusDocument, SupportedLanguage } from '../../types';

const languages: SupportedLanguage[] = ['ja', 'en', 'fr', 'af'];

type Draft = {
  date: string;
  author: string;
  category: string;
  tags: string;
  language: SupportedLanguage;
};

function toDraft(document: CorpusDocument): Draft {
  return {
    date: document.metadata.date ?? '',
    author: document.metadata.author ?? '',
    category: document.metadata.category ?? '',
    tags: document.metadata.tags.join(', '),
    language: document.metadata.language ?? 'en',
  };
}

function CorpusPanel() {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<CorpusDocument | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  const documents = useCorpusStore((state) => state.documents);
  const selectedIds = useCorpusStore((state) => state.selectedIds);
  const filter = useCorpusStore((state) => state.filter);
  const setFilter = useCorpusStore((state) => state.setFilter);
  const addDocuments = useCorpusStore((state) => state.addDocuments);
  const removeDocument = useCorpusStore((state) => state.removeDocument);
  const toggleSelected = useCorpusStore((state) => state.toggleSelected);
  const updateMetadata = useCorpusStore((state) => state.updateMetadata);

  const filteredDocuments = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return documents;
    return documents.filter((doc) => {
      const haystack = `${doc.filename} ${doc.metadata.author ?? ''} ${doc.metadata.category ?? ''} ${doc.metadata.tags.join(
        ' ',
      )}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [documents, filter]);

  const selectedDocument = documents.find((doc) => selectedIds.includes(doc.id));

  const handleFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter((file) => /\.(txt|md)$/i.test(file.name) || file.type.startsWith('text/'));
    if (files.length) await addDocuments(files);
  };

  const openMetadata = (document: CorpusDocument) => {
    setEditing(document);
    setDraft(toDraft(document));
  };

  const saveMetadata = () => {
    if (!editing || !draft) return;
    updateMetadata(editing.id, {
      date: draft.date || undefined,
      author: draft.author || undefined,
      category: draft.category || undefined,
      language: draft.language,
      tags: draft.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    });
    setEditing(null);
    setDraft(null);
  };

  return (
    <aside className="corpus-panel">
      <div className="panel-header">
        <h2 className="pane-title">{t('corpus.title')}</h2>
        <button className="icon-button" type="button" title={t('corpus.add')} onClick={() => inputRef.current?.click()}>
          <Upload size={17} />
        </button>
      </div>

      <label
        className="drop-zone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          void handleFiles(event.dataTransfer.files);
        }}
      >
        <Upload size={22} />
        <span>{t('corpus.dropHint')}</span>
        <input
          ref={inputRef}
          type="file"
          accept=".txt,.md,text/plain,text/markdown"
          multiple
          onChange={(event) => {
            if (event.target.files) void handleFiles(event.target.files);
            event.currentTarget.value = '';
          }}
        />
      </label>

      <div className="search-row">
        <div className="language-picker">
          <Search size={16} />
          <input
            className="text-input"
            value={filter}
            placeholder={t('corpus.filter')}
            onChange={(event) => setFilter(event.target.value)}
          />
        </div>
      </div>

      <div className="document-list" aria-label={t('corpus.title')}>
        {filteredDocuments.length === 0 && <div className="empty-state">{t('corpus.empty')}</div>}
        {filteredDocuments.map((document) => {
          const active = selectedIds.includes(document.id);
          return (
            <div key={document.id} className={active ? 'document-row active' : 'document-row'}>
              <button className="icon-button" type="button" title={t('corpus.selected')} onClick={() => toggleSelected(document.id)}>
                <FileText size={16} />
              </button>
              <button className="ghost-button document-main" type="button" onClick={() => toggleSelected(document.id)}>
                <span className="document-name">{document.filename}</span>
                <span className="document-meta">
                  {document.metadata.date ?? t('common.none')} · {document.content.length} {t('corpus.wordCount')}
                </span>
              </button>
              <div className="toolbar">
                <button className="icon-button" type="button" title={t('corpus.metadata')} onClick={() => openMetadata(document)}>
                  <Edit3 size={16} />
                </button>
                <button className="icon-button" type="button" title={t('common.delete')} onClick={() => removeDocument(document.id)}>
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="metadata-summary">
        <h3 className="section-title">{t('corpus.preview')}</h3>
        {selectedDocument ? (
          <>
            <div className="single-line">{selectedDocument.filename}</div>
            <div className="muted">
              {selectedDocument.metadata.author ?? t('common.none')} · {selectedDocument.metadata.category ?? t('common.none')}
            </div>
            <div className="muted">{selectedDocument.content.slice(0, 220)}</div>
          </>
        ) : (
          <div className="muted">{t('corpus.noSelection')}</div>
        )}
      </div>

      {editing && draft && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal" role="dialog" aria-modal="true" aria-label={t('corpus.metadata')}>
            <div className="panel-header">
              <h2 className="section-title">{t('corpus.metadata')}</h2>
              <button className="icon-button" type="button" title={t('common.delete')} onClick={() => setEditing(null)}>
                <Trash2 size={16} />
              </button>
            </div>
            <div className="panel-body">
              <label className="field">
                <span>{t('corpus.filename')}</span>
                <input className="text-input" value={editing.filename} disabled />
              </label>
              <div className="field-grid">
                <label className="field">
                  <span>{t('corpus.date')}</span>
                  <input className="text-input" type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} />
                </label>
                <label className="field">
                  <span>{t('corpus.language')}</span>
                  <select className="select-input" value={draft.language} onChange={(event) => setDraft({ ...draft, language: event.target.value as SupportedLanguage })}>
                    {languages.map((language) => (
                      <option key={language} value={language}>
                        {language.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="field">
                <span>{t('corpus.author')}</span>
                <input className="text-input" value={draft.author} onChange={(event) => setDraft({ ...draft, author: event.target.value })} />
              </label>
              <label className="field">
                <span>{t('corpus.category')}</span>
                <input className="text-input" value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} />
              </label>
              <label className="field">
                <span>{t('corpus.tags')}</span>
                <input className="text-input" value={draft.tags} onChange={(event) => setDraft({ ...draft, tags: event.target.value })} />
              </label>
              <div className="toolbar">
                <button className="primary-button" type="button" onClick={saveMetadata}>
                  {t('common.save')}
                </button>
                <button className="ghost-button" type="button" onClick={() => setEditing(null)}>
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

export default CorpusPanel;

