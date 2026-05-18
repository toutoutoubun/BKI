import { Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCodingStore } from '../../store/codingStore';
import type { CorpusDocument } from '../../types';

interface Props {
  documents: CorpusDocument[];
}

function QdaTab({ documents }: Props) {
  const { t } = useTranslation();
  const codes = useCodingStore((state) => state.codes);
  const annotations = useCodingStore((state) => state.annotations);
  const addCode = useCodingStore((state) => state.addCode);
  const removeCode = useCodingStore((state) => state.removeCode);
  const addAnnotation = useCodingStore((state) => state.addAnnotation);
  const removeAnnotation = useCodingStore((state) => state.removeAnnotation);

  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#2f80ed');
  const [documentId, setDocumentId] = useState(documents[0]?.id ?? '');
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(120);
  const [memo, setMemo] = useState('');

  const selectedDocument = useMemo(
    () => documents.find((document) => document.id === documentId) ?? documents[0],
    [documentId, documents],
  );

  const submitCode = () => {
    if (!label.trim()) return;
    addCode({ label: label.trim(), description: description.trim() || undefined, color });
    setLabel('');
    setDescription('');
  };

  const submitAnnotation = () => {
    if (!selectedDocument || codes.length === 0) return;
    addAnnotation({
      documentId: selectedDocument.id,
      start: Math.max(0, start),
      end: Math.max(start, end),
      codeIds: [codes[0].id],
      memo: memo.trim() || undefined,
    });
    setMemo('');
  };

  return (
    <div className="work-grid">
      <section className="panel">
        <div className="panel-header">
          <h2 className="section-title">{t('qda.codes')}</h2>
          <button className="primary-button" type="button" onClick={submitCode}>
            <Plus size={17} />
            {t('qda.addCode')}
          </button>
        </div>
        <div className="panel-body">
          <div className="field-grid">
            <label className="field">
              <span>{t('qda.codeLabel')}</span>
              <input className="text-input" value={label} onChange={(event) => setLabel(event.target.value)} />
            </label>
            <label className="field">
              <span>{t('qda.color')}</span>
              <input className="text-input" type="color" value={color} onChange={(event) => setColor(event.target.value)} />
            </label>
          </div>
          <label className="field">
            <span>{t('qda.description')}</span>
            <input className="text-input" value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>

          {codes.length === 0 && <div className="empty-state">{t('qda.noCodes')}</div>}
          {codes.map((code) => (
            <div className="code-row" key={code.id}>
              <span className="color-chip" style={{ background: code.color }} />
              <div>
                <strong>{code.label}</strong>
                <div className="muted">{code.description ?? t('common.none')}</div>
              </div>
              <button className="icon-button" type="button" title={t('common.delete')} onClick={() => removeCode(code.id)}>
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2 className="section-title">{t('qda.annotations')}</h2>
          <button className="primary-button" type="button" onClick={submitAnnotation}>
            <Plus size={17} />
            {t('common.add')}
          </button>
        </div>
        <div className="panel-body">
          <label className="field">
            <span>{t('qda.document')}</span>
            <select className="select-input" value={selectedDocument?.id ?? ''} onChange={(event) => setDocumentId(event.target.value)}>
              {documents.map((document) => (
                <option key={document.id} value={document.id}>
                  {document.filename}
                </option>
              ))}
            </select>
          </label>
          <div className="field-grid">
            <label className="field">
              <span>{t('qda.start')}</span>
              <input className="text-input" type="number" value={start} onChange={(event) => setStart(Number(event.target.value))} />
            </label>
            <label className="field">
              <span>{t('qda.end')}</span>
              <input className="text-input" type="number" value={end} onChange={(event) => setEnd(Number(event.target.value))} />
            </label>
          </div>
          <label className="field">
            <span>{t('qda.memo')}</span>
            <textarea className="text-area" value={memo} onChange={(event) => setMemo(event.target.value)} />
          </label>
          {selectedDocument && <div className="muted">{selectedDocument.content.slice(start, end)}</div>}

          {annotations.length === 0 && <div className="empty-state">{t('qda.noAnnotations')}</div>}
          {annotations.map((annotation) => {
            const doc = documents.find((document) => document.id === annotation.documentId);
            return (
              <div className="result-row" key={annotation.id}>
                <strong>{doc?.filename ?? annotation.documentId}</strong>
                <span className="muted">
                  {t('qda.range')}: {annotation.start}-{annotation.end}
                </span>
                <span>{annotation.memo ?? t('common.none')}</span>
                <button className="danger-button" type="button" onClick={() => removeAnnotation(annotation.id)}>
                  <Trash2 size={16} />
                  {t('common.delete')}
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export default QdaTab;

