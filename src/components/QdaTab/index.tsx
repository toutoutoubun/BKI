import { Edit3, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCodingStore } from '../../store/codingStore';
import type { Annotation, CorpusDocument } from '../../types';

interface Props {
  documents: CorpusDocument[];
}

interface CodeSummary {
  codeId: string;
  label: string;
  color: string;
  annotationCount: number;
  documentCount: number;
  characterCount: number;
  memoCount: number;
}

function clampRange(start: number, end: number, contentLength: number) {
  const safeStart = Math.max(0, Math.min(start, contentLength));
  const safeEnd = Math.max(safeStart, Math.min(end, contentLength));
  return { safeStart, safeEnd };
}

function QdaTab({ documents }: Props) {
  const { t } = useTranslation();
  const textRef = useRef<HTMLTextAreaElement>(null);
  const codes = useCodingStore((state) => state.codes);
  const annotations = useCodingStore((state) => state.annotations);
  const addCode = useCodingStore((state) => state.addCode);
  const updateCode = useCodingStore((state) => state.updateCode);
  const removeCode = useCodingStore((state) => state.removeCode);
  const addAnnotation = useCodingStore((state) => state.addAnnotation);
  const updateAnnotation = useCodingStore((state) => state.updateAnnotation);
  const removeAnnotation = useCodingStore((state) => state.removeAnnotation);

  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#2f80ed');
  const [parentId, setParentId] = useState('');
  const [documentId, setDocumentId] = useState(documents[0]?.id ?? '');
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(120);
  const [memo, setMemo] = useState('');
  const [selectedCodeIds, setSelectedCodeIds] = useState<string[]>(codes[0]?.id ? [codes[0].id] : []);
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null);
  const [editStart, setEditStart] = useState(0);
  const [editEnd, setEditEnd] = useState(0);
  const [editMemo, setEditMemo] = useState('');
  const [editCodeIds, setEditCodeIds] = useState<string[]>([]);

  const selectedDocument = useMemo(
    () => documents.find((document) => document.id === documentId) ?? documents[0],
    [documentId, documents],
  );

  useEffect(() => {
    if (!selectedDocument && documents[0]) setDocumentId(documents[0].id);
  }, [documents, selectedDocument]);

  useEffect(() => {
    setSelectedCodeIds((current) => {
      const valid = current.filter((codeId) => codes.some((code) => code.id === codeId));
      if (valid.length) return valid;
      return codes[0]?.id ? [codes[0].id] : [];
    });
  }, [codes]);

  useEffect(() => {
    if (parentId && !codes.some((code) => code.id === parentId)) setParentId('');
  }, [codes, parentId]);

  useEffect(() => {
    setEditCodeIds((current) => current.filter((codeId) => codes.some((code) => code.id === codeId)));
  }, [codes]);

  const documentAnnotations = useMemo(
    () => annotations.filter((annotation) => annotation.documentId === selectedDocument?.id),
    [annotations, selectedDocument?.id],
  );

  const selectedText = selectedDocument?.content.slice(start, end) ?? '';

  const codeSummaries = useMemo<CodeSummary[]>(
    () =>
      codes.map((code) => {
        const codeAnnotations = annotations.filter((annotation) => annotation.codeIds.includes(code.id));
        return {
          codeId: code.id,
          label: code.label,
          color: code.color,
          annotationCount: codeAnnotations.length,
          documentCount: new Set(codeAnnotations.map((annotation) => annotation.documentId)).size,
          characterCount: codeAnnotations.reduce((sum, annotation) => sum + Math.max(0, annotation.end - annotation.start), 0),
          memoCount: codeAnnotations.filter((annotation) => annotation.memo?.trim()).length,
        };
      }),
    [annotations, codes],
  );

  const codeDocumentMatrix = useMemo(
    () =>
      codes.map((code) => ({
        code,
        counts: documents.map((document) => ({
          document,
          count: annotations.filter((annotation) => annotation.documentId === document.id && annotation.codeIds.includes(code.id)).length,
        })),
      })),
    [annotations, codes, documents],
  );

  const descendantIds = useMemo(() => {
    const childrenByParent = new Map<string, string[]>();
    codes.forEach((code) => {
      if (!code.parentId) return;
      childrenByParent.set(code.parentId, [...(childrenByParent.get(code.parentId) ?? []), code.id]);
    });

    const collect = (codeId: string, seen = new Set<string>()) => {
      for (const childId of childrenByParent.get(codeId) ?? []) {
        if (seen.has(childId)) continue;
        seen.add(childId);
        collect(childId, seen);
      }
      return seen;
    };

    return new Map(codes.map((code) => [code.id, collect(code.id)]));
  }, [codes]);

  const codeDepth = (codeId: string) => {
    let depth = 0;
    let current = codes.find((code) => code.id === codeId);
    const seen = new Set<string>();
    while (current?.parentId && !seen.has(current.parentId)) {
      seen.add(current.parentId);
      depth += 1;
      current = codes.find((code) => code.id === current?.parentId);
    }
    return depth;
  };

  const parentOptions = (codeId?: string) =>
    codes.filter((code) => {
      if (!codeId) return true;
      return code.id !== codeId && !descendantIds.get(codeId)?.has(code.id);
    });

  const submitCode = () => {
    if (!label.trim()) return;
    addCode({ label: label.trim(), description: description.trim() || undefined, color, parentId: parentId || undefined });
    setLabel('');
    setDescription('');
    setParentId('');
  };

  const updateSelectionFromTextarea = () => {
    const element = textRef.current;
    if (!element || !selectedDocument) return;
    if (element.selectionStart === element.selectionEnd) return;
    const { safeStart, safeEnd } = clampRange(element.selectionStart, element.selectionEnd, selectedDocument.content.length);
    setStart(safeStart);
    setEnd(safeEnd);
  };

  const toggleCodeSelection = (codeId: string) => {
    setSelectedCodeIds((current) => {
      if (current.includes(codeId)) return current.filter((id) => id !== codeId);
      return [...current, codeId];
    });
  };

  const submitAnnotation = () => {
    if (!selectedDocument || selectedCodeIds.length === 0) return;
    const { safeStart, safeEnd } = clampRange(start, end, selectedDocument.content.length);
    if (safeStart === safeEnd) return;
    addAnnotation({
      documentId: selectedDocument.id,
      start: safeStart,
      end: safeEnd,
      codeIds: selectedCodeIds,
      memo: memo.trim() || undefined,
    });
    setMemo('');
  };

  const openAnnotationEdit = (annotation: Annotation) => {
    setEditingAnnotationId(annotation.id);
    setEditStart(annotation.start);
    setEditEnd(annotation.end);
    setEditMemo(annotation.memo ?? '');
    setEditCodeIds(annotation.codeIds.filter((codeId) => codes.some((code) => code.id === codeId)));
  };

  const cancelAnnotationEdit = () => {
    setEditingAnnotationId(null);
    setEditStart(0);
    setEditEnd(0);
    setEditMemo('');
    setEditCodeIds([]);
  };

  const toggleEditCodeSelection = (codeId: string) => {
    setEditCodeIds((current) => {
      if (current.includes(codeId)) return current.filter((id) => id !== codeId);
      return [...current, codeId];
    });
  };

  const saveAnnotationEdit = (annotation: Annotation) => {
    const document = documents.find((candidate) => candidate.id === annotation.documentId);
    if (!document || editCodeIds.length === 0) return;
    const { safeStart, safeEnd } = clampRange(editStart, editEnd, document.content.length);
    if (safeStart === safeEnd) return;
    updateAnnotation(annotation.id, {
      start: safeStart,
      end: safeEnd,
      codeIds: editCodeIds,
      memo: editMemo.trim() || undefined,
    });
    cancelAnnotationEdit();
  };

  const annotationCodes = (annotation: Annotation) =>
    annotation.codeIds
      .map((codeId) => codes.find((code) => code.id === codeId))
      .filter((code): code is NonNullable<typeof code> => Boolean(code))
      .map((code) => (
        <span className="code-pill" key={code.id} style={{ borderColor: code.color }}>
          <span className="color-chip small" style={{ background: code.color }} />
          {code.label}
        </span>
      ));

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
          <label className="field">
            <span>{t('qda.parentCode')}</span>
            <select className="select-input" value={parentId} onChange={(event) => setParentId(event.target.value)}>
              <option value="">{t('qda.noParent')}</option>
              {parentOptions().map((code) => (
                <option key={code.id} value={code.id}>
                  {'- '.repeat(codeDepth(code.id))}
                  {code.label}
                </option>
              ))}
            </select>
          </label>

          {codes.length === 0 && <div className="empty-state">{t('qda.noCodes')}</div>}
          {codes.map((code) => (
            <div className="code-row" key={code.id} style={{ marginLeft: `${Math.min(codeDepth(code.id), 4) * 14}px` }}>
              <span className="color-chip" style={{ background: code.color }} />
              <div>
                <strong>{code.label}</strong>
                <div className="muted">{code.description ?? t('common.none')}</div>
              </div>
              <label className="code-parent-control">
                <span>{t('qda.parentCode')}</span>
                <select
                  className="select-input"
                  value={code.parentId ?? ''}
                  onChange={(event) => updateCode(code.id, { parentId: event.target.value || undefined })}
                >
                  <option value="">{t('qda.noParent')}</option>
                  {parentOptions(code.id).map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {'- '.repeat(codeDepth(candidate.id))}
                      {candidate.label}
                    </option>
                  ))}
                </select>
              </label>
              <button className="icon-button" type="button" title={t('common.delete')} onClick={() => removeCode(code.id)}>
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2 className="section-title">{t('qda.selectionCoding')}</h2>
          <button className="primary-button" type="button" disabled={!selectedText || selectedCodeIds.length === 0} onClick={submitAnnotation}>
            <Plus size={17} />
            {t('qda.codeSelection')}
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

          <label className="field">
            <span>{t('qda.documentText')}</span>
            <textarea
              ref={textRef}
              className="text-area qda-document-text"
              readOnly
              value={selectedDocument?.content ?? ''}
              onSelect={updateSelectionFromTextarea}
            />
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

          <div className="field">
            <span>{t('qda.applyCodes')}</span>
            <div className="code-checkbox-grid">
              {codes.map((code) => (
                <label className="checkbox-row" key={code.id}>
                  <input type="checkbox" checked={selectedCodeIds.includes(code.id)} onChange={() => toggleCodeSelection(code.id)} />
                  <span className="color-chip small" style={{ background: code.color }} />
                  <span>{code.label}</span>
                </label>
              ))}
            </div>
          </div>

          <label className="field">
            <span>{t('qda.memo')}</span>
            <textarea className="text-area" value={memo} onChange={(event) => setMemo(event.target.value)} />
          </label>

          <div className="selection-preview">
            <strong>{t('qda.selectedText')}</strong>
            <p>{selectedText || t('qda.noSelection')}</p>
          </div>
        </div>
      </section>

      <section className="panel span-all">
        <div className="panel-header">
          <h2 className="section-title">{t('qda.annotations')}</h2>
          <span className="muted">{documentAnnotations.length} {t('qda.annotations')}</span>
        </div>
        <div className="panel-body annotation-grid">
          {documentAnnotations.length === 0 && <div className="empty-state">{t('qda.noAnnotations')}</div>}
          {documentAnnotations.map((annotation) => (
            <div className="result-row" key={annotation.id}>
              {editingAnnotationId === annotation.id ? (
                <>
                  <div className="field-grid">
                    <label className="field">
                      <span>{t('qda.start')}</span>
                      <input className="text-input" type="number" value={editStart} onChange={(event) => setEditStart(Number(event.target.value))} />
                    </label>
                    <label className="field">
                      <span>{t('qda.end')}</span>
                      <input className="text-input" type="number" value={editEnd} onChange={(event) => setEditEnd(Number(event.target.value))} />
                    </label>
                  </div>

                  <div className="field">
                    <span>{t('qda.applyCodes')}</span>
                    <div className="code-checkbox-grid">
                      {codes.map((code) => (
                        <label className="checkbox-row" key={code.id}>
                          <input type="checkbox" checked={editCodeIds.includes(code.id)} onChange={() => toggleEditCodeSelection(code.id)} />
                          <span className="color-chip small" style={{ background: code.color }} />
                          <span>{code.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <label className="field">
                    <span>{t('qda.memo')}</span>
                    <textarea className="text-area" value={editMemo} onChange={(event) => setEditMemo(event.target.value)} />
                  </label>

                  <div className="selection-preview">
                    <strong>{t('qda.selectedText')}</strong>
                    <p>{selectedDocument?.content.slice(editStart, editEnd) || t('qda.noSelection')}</p>
                  </div>

                  <div className="toolbar">
                    <button className="primary-button" type="button" disabled={editCodeIds.length === 0 || editStart === editEnd} onClick={() => saveAnnotationEdit(annotation)}>
                      {t('common.save')}
                    </button>
                    <button className="ghost-button" type="button" onClick={cancelAnnotationEdit}>
                      {t('common.cancel')}
                    </button>
                    <button
                      className="danger-button"
                      type="button"
                      onClick={() => {
                        removeAnnotation(annotation.id);
                        cancelAnnotationEdit();
                      }}
                    >
                      <Trash2 size={16} />
                      {t('common.delete')}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="toolbar">{annotationCodes(annotation)}</div>
                  <span className="muted">
                    {t('qda.range')}: {annotation.start}-{annotation.end}
                  </span>
                  <span>{selectedDocument?.content.slice(annotation.start, annotation.end) ?? ''}</span>
                  <span className="muted">{annotation.memo ?? t('common.none')}</span>
                  <div className="toolbar">
                    <button className="ghost-button" type="button" onClick={() => openAnnotationEdit(annotation)}>
                      <Edit3 size={16} />
                      {t('qda.editAnnotation')}
                    </button>
                    <button className="danger-button" type="button" onClick={() => removeAnnotation(annotation.id)}>
                      <Trash2 size={16} />
                      {t('common.delete')}
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="panel span-all">
        <div className="panel-header">
          <h2 className="section-title">{t('qda.codeAnalysis')}</h2>
        </div>
        <div className="panel-body">
          <div className="table-wrap">
            <table className="analysis-table">
              <thead>
                <tr>
                  <th>{t('qda.codeLabel')}</th>
                  <th>{t('qda.annotationCount')}</th>
                  <th>{t('qda.documentCount')}</th>
                  <th>{t('qda.characterCount')}</th>
                  <th>{t('qda.memoCount')}</th>
                </tr>
              </thead>
              <tbody>
                {codeSummaries.map((summary) => (
                  <tr key={summary.codeId}>
                    <td>
                      <span className="code-pill" style={{ borderColor: summary.color }}>
                        <span className="color-chip small" style={{ background: summary.color }} />
                        {summary.label}
                      </span>
                    </td>
                    <td>{summary.annotationCount}</td>
                    <td>{summary.documentCount}</td>
                    <td>{summary.characterCount}</td>
                    <td>{summary.memoCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="table-wrap">
            <table className="analysis-table">
              <thead>
                <tr>
                  <th>{t('qda.codeDocumentMatrix')}</th>
                  {documents.map((document) => (
                    <th key={document.id}>{document.filename}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {codeDocumentMatrix.map((row) => (
                  <tr key={row.code.id}>
                    <td>
                      <span className="code-pill" style={{ borderColor: row.code.color }}>
                        <span className="color-chip small" style={{ background: row.code.color }} />
                        {row.code.label}
                      </span>
                    </td>
                    {row.counts.map(({ document, count }) => (
                      <td key={document.id}>{count}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

export default QdaTab;
