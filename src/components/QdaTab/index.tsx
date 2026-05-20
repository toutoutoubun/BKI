import { BarChart3, CheckCircle2, Download, Edit3, FileDown, Plus, Sparkles, Trash2, Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAnalysisStore } from '../../store/analysisStore';
import { useCodingStore, type ImportedCode } from '../../store/codingStore';
import { useProcessStore } from '../../store/processStore';
import type { Annotation, Code, CorpusDocument } from '../../types';

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

interface AutoCodeSuggestion {
  id: string;
  documentId: string;
  documentName: string;
  codeId: string;
  codeLabel: string;
  codeColor: string;
  start: number;
  end: number;
  term: string;
  excerpt: string;
  confidence: number;
}

interface CoverageRow {
  documentId: string;
  filename: string;
  annotationCount: number;
  distinctCodeCount: number;
  codedCharacters: number;
  coverage: number;
}

interface CooccurrenceRow {
  sourceId: string;
  sourceLabel: string;
  sourceColor: string;
  targetId: string;
  targetLabel: string;
  targetColor: string;
  count: number;
}

interface CodeKeywordRow {
  codeId: string;
  codeLabel: string;
  codeColor: string;
  keywordGroupId: string;
  keywordGroupName: string;
  hitCount: number;
  annotationCount: number;
  documentCount: number;
  terms: string[];
}

interface MixedEvidenceRow {
  id: string;
  annotationId: string;
  documentId: string;
  documentName: string;
  codeId: string;
  codeLabel: string;
  codeColor: string;
  keywordGroupId: string;
  keywordGroupName: string;
  term: string;
  start: number;
  end: number;
  excerpt: string;
}

type CaseDimension = 'category' | 'author' | 'language' | 'tag';
type AuditSeverity = 'ok' | 'info' | 'warning';

interface AuditFinding {
  severity: AuditSeverity;
  issue: string;
  detail: string;
  fix: string;
}

function clampRange(start: number, end: number, contentLength: number) {
  const safeStart = Math.max(0, Math.min(start, contentLength));
  const safeEnd = Math.max(safeStart, Math.min(end, contentLength));
  return { safeStart, safeEnd };
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

function toCsv(rows: Array<Record<string, string | number | undefined>>) {
  if (!rows.length) return '';
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const escape = (value: string | number | undefined) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  return [headers.join(','), ...rows.map((row) => headers.map((header) => escape(row[header] ?? '')).join(','))].join('\n');
}

function parseCsvRows(content: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];
    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      row.push(cell.trim());
      cell = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function parseCodebookCsv(content: string): ImportedCode[] {
  const rows = parseCsvRows(content);
  if (!rows.length) return [];
  const header = rows[0].map((cell) => cell.toLowerCase());
  const hasHeader = ['label', 'code', 'name', 'description', 'color', 'parent'].some((key) => header.includes(key));
  const labelIndex = hasHeader ? Math.max(header.indexOf('label'), header.indexOf('code'), header.indexOf('name')) : 0;
  const descriptionIndex = hasHeader ? header.indexOf('description') : 1;
  const colorIndex = hasHeader ? header.indexOf('color') : 2;
  const parentIndex = hasHeader ? Math.max(header.indexOf('parent'), header.indexOf('parentcode'), header.indexOf('parent_code')) : 3;

  return rows.slice(hasHeader ? 1 : 0).flatMap((row) => {
    const label = row[labelIndex]?.trim();
    if (!label) return [];
    return [{
      label,
      description: descriptionIndex >= 0 ? row[descriptionIndex] : undefined,
      color: colorIndex >= 0 ? row[colorIndex] : undefined,
      parentLabel: parentIndex >= 0 ? row[parentIndex] : undefined,
    }];
  });
}

function parseAnnotationCsv(content: string, documents: CorpusDocument[], codes: Code[]): Array<Omit<Annotation, 'id'>> {
  const rows = parseCsvRows(content);
  if (!rows.length) return [];
  const header = rows[0].map((cell) => cell.toLowerCase());
  const hasHeader = ['document', 'document_id', 'start', 'end', 'codes', 'memo'].some((key) => header.includes(key));
  const documentIndex = hasHeader ? Math.max(header.indexOf('document'), header.indexOf('document_id')) : 0;
  const startIndex = hasHeader ? header.indexOf('start') : 1;
  const endIndex = hasHeader ? header.indexOf('end') : 2;
  const codesIndex = hasHeader ? Math.max(header.indexOf('codes'), header.indexOf('code')) : 3;
  const memoIndex = hasHeader ? header.indexOf('memo') : 4;
  const documentByKey = new Map<string, CorpusDocument>();
  documents.forEach((document) => {
    documentByKey.set(document.id.toLowerCase(), document);
    documentByKey.set(document.filename.toLowerCase(), document);
  });
  const codeByKey = new Map<string, string>();
  codes.forEach((code) => {
    codeByKey.set(code.id.toLowerCase(), code.id);
    codeByKey.set(code.label.toLowerCase(), code.id);
  });

  return rows.slice(hasHeader ? 1 : 0).flatMap((row) => {
    const documentKey = row[documentIndex]?.trim().toLowerCase();
    const document = documentKey ? documentByKey.get(documentKey) : undefined;
    if (!document) return [];
    const start = Number(row[startIndex]);
    const end = Number(row[endIndex]);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
    const codeIds = (row[codesIndex] ?? '')
      .split(/[;,]/)
      .map((code) => code.trim().toLowerCase())
      .flatMap((code) => codeByKey.get(code) ?? [])
      .filter((codeId, index, all) => all.indexOf(codeId) === index);
    if (!codeIds.length) return [];
    const { safeStart, safeEnd } = clampRange(Math.floor(start), Math.floor(end), document.content.length);
    if (safeStart === safeEnd) return [];
    return [{
      documentId: document.id,
      start: safeStart,
      end: safeEnd,
      codeIds,
      memo: memoIndex >= 0 ? row[memoIndex]?.trim() || undefined : undefined,
    }];
  });
}

function truncate(value: string, limit = 220) {
  return value.length > limit ? `${value.slice(0, limit - 3)}...` : value;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function uniqueValues(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function codeSearchTerms(code: Code) {
  const source = `${code.label} ${code.description ?? ''}`;
  const phraseTerms = [code.label, ...(code.description?.match(/"([^"]+)"/g)?.map((term) => term.replaceAll('"', '')) ?? [])];
  const wordTerms = source
    .split(/[,\s;:()[\]{}'"“”‘’、。！？!?.]+/u)
    .map((term) => term.trim())
    .filter((term) => term.length >= 3);
  return uniqueValues([...phraseTerms, ...wordTerms]).slice(0, 12);
}

function findTermHits(text: string, terms: string[]) {
  const hits: Array<{ term: string; start: number; end: number }> = [];
  uniqueValues(terms)
    .sort((left, right) => right.length - left.length)
    .slice(0, 100)
    .forEach((term) => {
      const expression = new RegExp(escapeRegExp(term), term.match(/^[\w -]+$/i) ? 'giu' : 'gu');
      let match: RegExpExecArray | null;
      while ((match = expression.exec(text))) {
        if (!match[0]) {
          expression.lastIndex += 1;
          continue;
        }
        hits.push({ term, start: match.index, end: match.index + match[0].length });
      }
    });
  return hits.sort((left, right) => left.start - right.start || right.end - left.end || left.term.localeCompare(right.term));
}

function sentenceRange(content: string, start: number, end: number) {
  const leftBoundary = Math.max(
    content.lastIndexOf('\n', start),
    content.lastIndexOf('.', start),
    content.lastIndexOf('!', start),
    content.lastIndexOf('?', start),
    content.lastIndexOf('。', start),
    content.lastIndexOf('！', start),
    content.lastIndexOf('？', start),
  );
  const rightCandidates = ['\n', '.', '!', '?', '。', '！', '？']
    .map((marker) => content.indexOf(marker, end))
    .filter((index) => index >= 0);
  const rightBoundary = rightCandidates.length ? Math.min(...rightCandidates) + 1 : content.length;
  const safeStart = Math.max(0, leftBoundary >= 0 ? leftBoundary + 1 : start - 100);
  const safeEnd = Math.min(content.length, rightBoundary - safeStart > 360 ? end + 120 : rightBoundary);
  return clampRange(safeStart, safeEnd, content.length);
}

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

function mergeRanges(ranges: Array<{ start: number; end: number }>) {
  const sorted = ranges
    .map((range) => ({ start: Math.max(0, range.start), end: Math.max(0, range.end) }))
    .filter((range) => range.end > range.start)
    .sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [];
  sorted.forEach((range) => {
    const last = merged.at(-1);
    if (!last || range.start > last.end) {
      merged.push({ ...range });
      return;
    }
    last.end = Math.max(last.end, range.end);
  });
  return merged;
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function QdaTab({ documents }: Props) {
  const { t } = useTranslation();
  const textRef = useRef<HTMLTextAreaElement>(null);
  const codebookInputRef = useRef<HTMLInputElement>(null);
  const annotationInputRef = useRef<HTMLInputElement>(null);
  const keywordGroups = useAnalysisStore((state) => state.keywordGroups);
  const codes = useCodingStore((state) => state.codes);
  const annotations = useCodingStore((state) => state.annotations);
  const addCode = useCodingStore((state) => state.addCode);
  const importCodes = useCodingStore((state) => state.importCodes);
  const updateCode = useCodingStore((state) => state.updateCode);
  const removeCode = useCodingStore((state) => state.removeCode);
  const addAnnotation = useCodingStore((state) => state.addAnnotation);
  const importAnnotations = useCodingStore((state) => state.importAnnotations);
  const updateAnnotation = useCodingStore((state) => state.updateAnnotation);
  const removeAnnotation = useCodingStore((state) => state.removeAnnotation);
  const addLog = useProcessStore((state) => state.addLog);

  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#2f80ed');
  const [parentId, setParentId] = useState('');
  const [documentId, setDocumentId] = useState(documents[0]?.id ?? '');
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(120);
  const [memo, setMemo] = useState('');
  const [selectedCodeIds, setSelectedCodeIds] = useState<string[]>(codes[0]?.id ? [codes[0].id] : []);
  const [editingCodeId, setEditingCodeId] = useState<string | null>(null);
  const [editCodeLabel, setEditCodeLabel] = useState('');
  const [editCodeDescription, setEditCodeDescription] = useState('');
  const [editCodeColor, setEditCodeColor] = useState('#2f80ed');
  const [editCodeParentId, setEditCodeParentId] = useState('');
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null);
  const [editStart, setEditStart] = useState(0);
  const [editEnd, setEditEnd] = useState(0);
  const [editMemo, setEditMemo] = useState('');
  const [editCodeIds, setEditCodeIds] = useState<string[]>([]);
  const [codebookImportMessage, setCodebookImportMessage] = useState('');
  const [annotationImportMessage, setAnnotationImportMessage] = useState('');
  const [autoCodeSuggestions, setAutoCodeSuggestions] = useState<AutoCodeSuggestion[]>([]);
  const [autoCodeMessage, setAutoCodeMessage] = useState('');
  const [minConfidence, setMinConfidence] = useState(0.62);
  const [suggestionLimit, setSuggestionLimit] = useState(80);
  const [caseDimension, setCaseDimension] = useState<CaseDimension>('category');

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
    if (editingCodeId && !codes.some((code) => code.id === editingCodeId)) setEditingCodeId(null);
    if (editCodeParentId && !codes.some((code) => code.id === editCodeParentId)) setEditCodeParentId('');
  }, [codes, editCodeParentId, editingCodeId]);

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

  const coverageRows = useMemo<CoverageRow[]>(
    () =>
      documents.map((document) => {
        const documentAnnotations = annotations.filter((annotation) => annotation.documentId === document.id);
        const codedCharacters = mergeRanges(documentAnnotations.map((annotation) => ({ start: annotation.start, end: annotation.end })))
          .reduce((sum, range) => sum + Math.max(0, range.end - range.start), 0);
        return {
          documentId: document.id,
          filename: document.filename,
          annotationCount: documentAnnotations.length,
          distinctCodeCount: new Set(documentAnnotations.flatMap((annotation) => annotation.codeIds)).size,
          codedCharacters,
          coverage: document.content.length ? codedCharacters / document.content.length : 0,
        };
      }),
    [annotations, documents],
  );

  const cooccurrenceRows = useMemo<CooccurrenceRow[]>(() => {
    const pairCounts = new Map<string, number>();
    const codeById = new Map(codes.map((code) => [code.id, code]));
    const addPair = (leftId: string, rightId: string) => {
      if (leftId === rightId) return;
      const [sourceId, targetId] = [leftId, rightId].sort();
      pairCounts.set(`${sourceId}\u0000${targetId}`, (pairCounts.get(`${sourceId}\u0000${targetId}`) ?? 0) + 1);
    };

    annotations.forEach((annotation) => {
      const ids = [...new Set(annotation.codeIds)].filter((codeId) => codeById.has(codeId));
      ids.forEach((leftId, leftIndex) => ids.slice(leftIndex + 1).forEach((rightId) => addPair(leftId, rightId)));
    });

    documents.forEach((document) => {
      const documentAnnotations = annotations.filter((annotation) => annotation.documentId === document.id);
      documentAnnotations.forEach((left, leftIndex) => {
        documentAnnotations.slice(leftIndex + 1).forEach((right) => {
          const gap = Math.max(0, Math.max(left.start, right.start) - Math.min(left.end, right.end));
          if (!rangesOverlap(left.start, left.end, right.start, right.end) && gap > 160) return;
          left.codeIds.forEach((leftId) => right.codeIds.forEach((rightId) => addPair(leftId, rightId)));
        });
      });
    });

    return [...pairCounts.entries()]
      .flatMap(([key, count]) => {
        const [sourceId, targetId] = key.split('\u0000');
        const source = codeById.get(sourceId);
        const target = codeById.get(targetId);
        if (!source || !target) return [];
        return [{
          sourceId,
          sourceLabel: source.label,
          sourceColor: source.color,
          targetId,
          targetLabel: target.label,
          targetColor: target.color,
          count,
        }];
      })
      .sort((a, b) => b.count - a.count || a.sourceLabel.localeCompare(b.sourceLabel));
  }, [annotations, codes, documents]);

  const cooccurrenceMatrix = useMemo(() => {
    const activeCodeIds = new Set(cooccurrenceRows.flatMap((row) => [row.sourceId, row.targetId]));
    const matrixCodes = codes.filter((code) => activeCodeIds.has(code.id)).slice(0, 12);
    const pairCounts = new Map<string, number>();
    cooccurrenceRows.forEach((row) => {
      pairCounts.set(`${row.sourceId}\u0000${row.targetId}`, row.count);
      pairCounts.set(`${row.targetId}\u0000${row.sourceId}`, row.count);
    });
    return {
      codes: matrixCodes,
      counts: pairCounts,
      max: Math.max(1, ...cooccurrenceRows.map((row) => row.count)),
    };
  }, [codes, cooccurrenceRows]);

  const mixedEvidenceRows = useMemo<MixedEvidenceRow[]>(() => {
    const documentById = new Map(documents.map((document) => [document.id, document]));
    const codeById = new Map(codes.map((code) => [code.id, code]));
    const activeKeywordGroups = keywordGroups
      .map((group) => ({ ...group, terms: uniqueValues(group.terms) }))
      .filter((group) => group.terms.length);
    const seen = new Set<string>();
    const rows: MixedEvidenceRow[] = [];

    annotations.forEach((annotation) => {
      const document = documentById.get(annotation.documentId);
      if (!document) return;
      const { safeStart, safeEnd } = clampRange(annotation.start, annotation.end, document.content.length);
      if (safeStart === safeEnd) return;
      const excerpt = document.content.slice(safeStart, safeEnd);
      const annotationCodes = annotation.codeIds
        .map((codeId) => codeById.get(codeId))
        .filter((code): code is Code => Boolean(code));
      if (!annotationCodes.length) return;

      activeKeywordGroups.forEach((group) => {
        findTermHits(excerpt, group.terms).forEach((hit) => {
          const absoluteStart = safeStart + hit.start;
          const absoluteEnd = safeStart + hit.end;
          annotationCodes.forEach((code) => {
            const id = `${annotation.id}\u0000${code.id}\u0000${group.id}\u0000${hit.term}\u0000${absoluteStart}`;
            if (seen.has(id)) return;
            seen.add(id);
            const contextStart = Math.max(0, absoluteStart - 80);
            const contextEnd = Math.min(document.content.length, absoluteEnd + 120);
            rows.push({
              id,
              annotationId: annotation.id,
              documentId: document.id,
              documentName: document.filename,
              codeId: code.id,
              codeLabel: code.label,
              codeColor: code.color,
              keywordGroupId: group.id,
              keywordGroupName: group.name,
              term: hit.term,
              start: absoluteStart,
              end: absoluteEnd,
              excerpt: truncate(document.content.slice(contextStart, contextEnd), 260),
            });
          });
        });
      });
    });

    return rows.sort(
      (left, right) =>
        left.documentName.localeCompare(right.documentName) ||
        left.start - right.start ||
        left.codeLabel.localeCompare(right.codeLabel) ||
        left.keywordGroupName.localeCompare(right.keywordGroupName),
    );
  }, [annotations, codes, documents, keywordGroups]);

  const codeKeywordRows = useMemo<CodeKeywordRow[]>(() => {
    const grouped = new Map<
      string,
      {
        codeId: string;
        codeLabel: string;
        codeColor: string;
        keywordGroupId: string;
        keywordGroupName: string;
        hitCount: number;
        annotationIds: Set<string>;
        documentIds: Set<string>;
        terms: Set<string>;
      }
    >();

    mixedEvidenceRows.forEach((row) => {
      const key = `${row.codeId}\u0000${row.keywordGroupId}`;
      const current =
        grouped.get(key) ??
        {
          codeId: row.codeId,
          codeLabel: row.codeLabel,
          codeColor: row.codeColor,
          keywordGroupId: row.keywordGroupId,
          keywordGroupName: row.keywordGroupName,
          hitCount: 0,
          annotationIds: new Set<string>(),
          documentIds: new Set<string>(),
          terms: new Set<string>(),
        };
      current.hitCount += 1;
      current.annotationIds.add(row.annotationId);
      current.documentIds.add(row.documentId);
      current.terms.add(row.term);
      grouped.set(key, current);
    });

    return [...grouped.values()]
      .map((row) => ({
        codeId: row.codeId,
        codeLabel: row.codeLabel,
        codeColor: row.codeColor,
        keywordGroupId: row.keywordGroupId,
        keywordGroupName: row.keywordGroupName,
        hitCount: row.hitCount,
        annotationCount: row.annotationIds.size,
        documentCount: row.documentIds.size,
        terms: [...row.terms].sort((left, right) => left.localeCompare(right)),
      }))
      .sort((left, right) => right.hitCount - left.hitCount || left.codeLabel.localeCompare(right.codeLabel));
  }, [mixedEvidenceRows]);

  const codeKeywordMatrix = useMemo(() => {
    const activeCodeIds = new Set(codeKeywordRows.map((row) => row.codeId));
    const activeGroupIds = new Set(codeKeywordRows.map((row) => row.keywordGroupId));
    const counts = new Map<string, number>();
    codeKeywordRows.forEach((row) => counts.set(`${row.codeId}\u0000${row.keywordGroupId}`, row.hitCount));
    return {
      codes: codes.filter((code) => activeCodeIds.has(code.id)).slice(0, 12),
      groups: keywordGroups.filter((group) => activeGroupIds.has(group.id)).slice(0, 12),
      counts,
      max: Math.max(1, ...codeKeywordRows.map((row) => row.hitCount)),
    };
  }, [codeKeywordRows, codes, keywordGroups]);

  const strongestCodeKeyword = codeKeywordRows[0];

  const corpusCoverage = useMemo(() => {
    const codedCharacters = coverageRows.reduce((sum, row) => sum + row.codedCharacters, 0);
    const totalCharacters = documents.reduce((sum, document) => sum + document.content.length, 0);
    return totalCharacters ? codedCharacters / totalCharacters : 0;
  }, [coverageRows, documents]);

  const caseMatrix = useMemo(() => {
    const caseMap = new Map<string, CorpusDocument[]>();
    documents.forEach((document) => {
      const values =
        caseDimension === 'tag'
          ? document.metadata.tags.length ? document.metadata.tags : [t('qda.uncategorized')]
          : [String(document.metadata[caseDimension] ?? '').trim() || t('qda.uncategorized')];
      values.forEach((value) => caseMap.set(value, [...(caseMap.get(value) ?? []), document]));
    });

    return [...caseMap.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([caseName, caseDocuments]) => {
        const documentIds = new Set(caseDocuments.map((document) => document.id));
        const caseAnnotations = annotations.filter((annotation) => documentIds.has(annotation.documentId));
        const counts = codes.map((code) => ({
          code,
          count: caseAnnotations.filter((annotation) => annotation.codeIds.includes(code.id)).length,
        }));
        return {
          caseName,
          documentCount: caseDocuments.length,
          counts,
        };
      });
  }, [annotations, caseDimension, codes, documents, t]);

  const auditFindings = useMemo<AuditFinding[]>(() => {
    const findings: AuditFinding[] = [];
    const uncodedDocuments = coverageRows.filter((row) => row.annotationCount === 0);
    const orphanCodes = codeSummaries.filter((summary) => summary.annotationCount === 0);
    const annotationsWithoutMemo = annotations.filter((annotation) => !annotation.memo?.trim());
    const longAnnotations = annotations.filter((annotation) => annotation.end - annotation.start > 1200);
    let overlapCount = 0;
    documents.forEach((document) => {
      const documentAnnotations = annotations.filter((annotation) => annotation.documentId === document.id);
      documentAnnotations.forEach((left, leftIndex) => {
        documentAnnotations.slice(leftIndex + 1).forEach((right) => {
          if (rangesOverlap(left.start, left.end, right.start, right.end)) overlapCount += 1;
        });
      });
    });

    if (!documents.length) {
      findings.push({ severity: 'info', issue: t('qda.auditNoDocuments'), detail: t('qda.auditNoDocumentsDetail'), fix: t('qda.auditNoDocumentsFix') });
    }
    if (uncodedDocuments.length) {
      findings.push({
        severity: 'warning',
        issue: t('qda.auditUncodedDocuments'),
        detail: t('qda.auditUncodedDocumentsDetail', { count: uncodedDocuments.length }),
        fix: t('qda.auditUncodedDocumentsFix'),
      });
    }
    if (orphanCodes.length) {
      findings.push({
        severity: 'info',
        issue: t('qda.auditOrphanCodes'),
        detail: t('qda.auditOrphanCodesDetail', { count: orphanCodes.length }),
        fix: t('qda.auditOrphanCodesFix'),
      });
    }
    if (annotationsWithoutMemo.length > Math.max(3, annotations.length * 0.65)) {
      findings.push({
        severity: 'info',
        issue: t('qda.auditMissingMemos'),
        detail: t('qda.auditMissingMemosDetail', { count: annotationsWithoutMemo.length }),
        fix: t('qda.auditMissingMemosFix'),
      });
    }
    if (overlapCount) {
      findings.push({
        severity: 'warning',
        issue: t('qda.auditOverlaps'),
        detail: t('qda.auditOverlapsDetail', { count: overlapCount }),
        fix: t('qda.auditOverlapsFix'),
      });
    }
    if (longAnnotations.length) {
      findings.push({
        severity: 'info',
        issue: t('qda.auditLongAnnotations'),
        detail: t('qda.auditLongAnnotationsDetail', { count: longAnnotations.length }),
        fix: t('qda.auditLongAnnotationsFix'),
      });
    }
    if (!findings.length) {
      findings.push({ severity: 'ok', issue: t('qda.auditOk'), detail: t('qda.auditOkDetail'), fix: t('qda.auditOkFix') });
    }
    return findings;
  }, [annotations, codeSummaries, coverageRows, documents, t]);

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

  const codebookRows = () =>
    codes.map((code) => {
      const codeAnnotations = annotations.filter((annotation) => annotation.codeIds.includes(code.id));
      return {
        id: code.id,
        label: code.label,
        description: code.description ?? '',
        parent: codes.find((candidate) => candidate.id === code.parentId)?.label ?? '',
        color: code.color,
        depth: codeDepth(code.id),
        annotations: codeAnnotations.length,
        documents: new Set(codeAnnotations.map((annotation) => annotation.documentId)).size,
      };
    });

  const annotationRows = () =>
    annotations
      .filter((annotation) => documents.some((document) => document.id === annotation.documentId))
      .map((annotation) => {
        const document = documents.find((candidate) => candidate.id === annotation.documentId);
        return {
          id: annotation.id,
          document: document?.filename ?? annotation.documentId,
          start: annotation.start,
          end: annotation.end,
          codes: annotation.codeIds
            .map((codeId) => codes.find((code) => code.id === codeId)?.label ?? codeId)
            .join(', '),
          memo: annotation.memo ?? '',
          excerpt: document ? truncate(document.content.slice(annotation.start, annotation.end)) : '',
        };
      });

  const insightRows = () => [
    ...coverageRows.map((row) => ({
      section: 'coverage',
      document: row.filename,
      annotation_count: row.annotationCount,
      distinct_codes: row.distinctCodeCount,
      coded_characters: row.codedCharacters,
      coverage_percent: (row.coverage * 100).toFixed(2),
    })),
    ...cooccurrenceRows.map((row) => ({
      section: 'code_cooccurrence',
      source_code: row.sourceLabel,
      target_code: row.targetLabel,
      count: row.count,
    })),
    ...codeKeywordRows.map((row) => ({
      section: 'code_keyword_bridge',
      code: row.codeLabel,
      keyword_group: row.keywordGroupName,
      keyword_hits: row.hitCount,
      annotations: row.annotationCount,
      documents: row.documentCount,
      terms: row.terms.join('; '),
    })),
    ...caseMatrix.flatMap((row) =>
      row.counts.map(({ code, count }) => ({
        section: 'case_matrix',
        case_dimension: caseDimension,
        case: row.caseName,
        document_count: row.documentCount,
        code: code.label,
        count,
      })),
    ),
    ...auditFindings.map((finding) => ({
      section: 'quality_audit',
      severity: finding.severity,
      issue: finding.issue,
      detail: finding.detail,
      fix: finding.fix,
    })),
  ];

  const mixedMethodRows = () => [
    ...codeKeywordRows.map((row) => ({
      section: 'code_keyword_matrix',
      code: row.codeLabel,
      keyword_group: row.keywordGroupName,
      keyword_hits: row.hitCount,
      annotations: row.annotationCount,
      documents: row.documentCount,
      terms: row.terms.join('; '),
    })),
    ...mixedEvidenceRows.map((row) => ({
      section: 'evidence',
      document: row.documentName,
      code: row.codeLabel,
      keyword_group: row.keywordGroupName,
      term: row.term,
      start: row.start,
      end: row.end,
      excerpt: row.excerpt,
    })),
  ];

  const exportCodebookCsv = () => {
    const rows = codebookRows();
    if (!rows.length) return;
    downloadText('bki-codebook.csv', toCsv(rows), 'text/csv;charset=utf-8');
    addLog({
      level: 'success',
      stage: 'qda.export',
      title: 'Codebook CSV exported',
      detail: `${rows.length} code row(s) were exported.`,
      data: { rowCount: rows.length },
    });
  };

  const exportAnnotationsCsv = () => {
    const rows = annotationRows();
    if (!rows.length) return;
    downloadText('bki-annotations.csv', toCsv(rows), 'text/csv;charset=utf-8');
    addLog({
      level: 'success',
      stage: 'qda.export',
      title: 'Annotation CSV exported',
      detail: `${rows.length} annotation row(s) were exported.`,
      data: { rowCount: rows.length, documentCount: documents.length },
    });
  };

  const exportInsightsCsv = () => {
    const rows = insightRows();
    if (!rows.length) return;
    downloadText('bki-qda-intelligence.csv', toCsv(rows), 'text/csv;charset=utf-8');
    addLog({
      level: 'success',
      stage: 'qda.intelligence',
      title: 'QDA intelligence CSV exported',
      detail: `${rows.length} insight row(s) were exported.`,
      data: { rowCount: rows.length, caseDimension },
    });
  };

  const exportMixedMethodsCsv = () => {
    const rows = mixedMethodRows();
    if (!rows.length) return;
    downloadText('bki-code-keyword-bridge.csv', toCsv(rows), 'text/csv;charset=utf-8');
    addLog({
      level: 'success',
      stage: 'qda.mixed_methods',
      title: 'Code-keyword bridge CSV exported',
      detail: `${rows.length} mixed-method row(s) were exported.`,
      data: {
        rowCount: rows.length,
        matrixRows: codeKeywordRows.length,
        evidenceRows: mixedEvidenceRows.length,
      },
    });
  };

  const importCodebookCsv = async (file: File) => {
    setCodebookImportMessage('');
    try {
      const importedCodes = parseCodebookCsv(await file.text());
      if (!importedCodes.length) throw new Error('No code rows found.');
      importCodes(importedCodes);
      setCodebookImportMessage(t('qda.importCodebookSuccess', { count: importedCodes.length }));
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setCodebookImportMessage(t('qda.importCodebookError'));
      addLog({
        level: 'error',
        stage: 'qda.codebook',
        title: 'Codebook CSV import failed',
        detail: message,
        data: { filename: file.name },
      });
    }
  };

  const importAnnotationsCsv = async (file: File) => {
    setAnnotationImportMessage('');
    try {
      const importedAnnotations = parseAnnotationCsv(await file.text(), documents, codes);
      if (!importedAnnotations.length) throw new Error('No valid annotation rows found.');
      importAnnotations(importedAnnotations);
      setAnnotationImportMessage(t('qda.importAnnotationsSuccess', { count: importedAnnotations.length }));
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setAnnotationImportMessage(t('qda.importAnnotationsError'));
      addLog({
        level: 'error',
        stage: 'qda.annotations',
        title: 'Annotation CSV import failed',
        detail: message,
        data: { filename: file.name },
      });
    }
  };

  const generateAutoCodeSuggestions = () => {
    const existingKeys = new Set(
      annotations.flatMap((annotation) =>
        annotation.codeIds.map((codeId) => `${annotation.documentId}\u0000${codeId}\u0000${annotation.start}\u0000${annotation.end}`),
      ),
    );
    const suggestions: AutoCodeSuggestion[] = [];
    const seen = new Set<string>();

    codes.forEach((code) => {
      codeSearchTerms(code).forEach((term) => {
        const expression = new RegExp(escapeRegExp(term), term.match(/^[\w -]+$/i) ? 'giu' : 'gu');
        documents.forEach((document) => {
          let match: RegExpExecArray | null;
          while ((match = expression.exec(document.content)) && suggestions.length < suggestionLimit * 3) {
            const matchStart = match.index;
            const matchEnd = match.index + match[0].length;
            const existingOverlap = annotations.some(
              (annotation) =>
                annotation.documentId === document.id &&
                annotation.codeIds.includes(code.id) &&
                rangesOverlap(annotation.start, annotation.end, matchStart, matchEnd),
            );
            if (existingOverlap) continue;
            const { safeStart, safeEnd } = sentenceRange(document.content, matchStart, matchEnd);
            const key = `${document.id}\u0000${code.id}\u0000${safeStart}\u0000${safeEnd}`;
            if (seen.has(key) || existingKeys.has(key)) continue;
            seen.add(key);
            const exactLabel = term.toLocaleLowerCase() === code.label.toLocaleLowerCase();
            const confidence = Math.min(0.99, (exactLabel ? 0.82 : term.includes(' ') ? 0.74 : 0.58) + Math.min(0.16, term.length / 90));
            if (confidence < minConfidence) continue;
            suggestions.push({
              id: key,
              documentId: document.id,
              documentName: document.filename,
              codeId: code.id,
              codeLabel: code.label,
              codeColor: code.color,
              start: safeStart,
              end: safeEnd,
              term,
              excerpt: truncate(document.content.slice(safeStart, safeEnd), 260),
              confidence,
            });
          }
        });
      });
    });

    const nextSuggestions = suggestions
      .sort((left, right) => right.confidence - left.confidence || left.documentName.localeCompare(right.documentName))
      .slice(0, suggestionLimit);
    setAutoCodeSuggestions(nextSuggestions);
    setAutoCodeMessage(t('qda.suggestionsGenerated', { count: nextSuggestions.length }));
    addLog({
      level: nextSuggestions.length ? 'success' : 'warning',
      stage: 'qda.auto_code',
      title: 'Auto-code suggestions generated',
      detail: `${nextSuggestions.length} suggestion(s) generated from code labels and descriptions.`,
      data: {
        suggestionCount: nextSuggestions.length,
        minConfidence,
        suggestionLimit,
        codeCount: codes.length,
        documentCount: documents.length,
      },
    });
  };

  const suggestionToAnnotation = (suggestion: AutoCodeSuggestion): Omit<Annotation, 'id'> => ({
    documentId: suggestion.documentId,
    start: suggestion.start,
    end: suggestion.end,
    codeIds: [suggestion.codeId],
    memo: t('qda.autoCodeMemo', { term: suggestion.term, confidence: Math.round(suggestion.confidence * 100) }),
  });

  const applyAutoCodeSuggestion = (suggestion: AutoCodeSuggestion) => {
    addAnnotation(suggestionToAnnotation(suggestion));
    setAutoCodeSuggestions((current) => current.filter((item) => item.id !== suggestion.id));
    setAutoCodeMessage(t('qda.suggestionsApplied', { count: 1 }));
  };

  const applyAllAutoCodeSuggestions = () => {
    if (!autoCodeSuggestions.length) return;
    importAnnotations(autoCodeSuggestions.map(suggestionToAnnotation));
    setAutoCodeMessage(t('qda.suggestionsApplied', { count: autoCodeSuggestions.length }));
    setAutoCodeSuggestions([]);
  };

  const submitCode = () => {
    if (!label.trim()) return;
    addCode({ label: label.trim(), description: description.trim() || undefined, color, parentId: parentId || undefined });
    setLabel('');
    setDescription('');
    setParentId('');
  };

  const openCodeEdit = (code: Code) => {
    setEditingCodeId(code.id);
    setEditCodeLabel(code.label);
    setEditCodeDescription(code.description ?? '');
    setEditCodeColor(code.color);
    setEditCodeParentId(code.parentId ?? '');
  };

  const cancelCodeEdit = () => {
    setEditingCodeId(null);
    setEditCodeLabel('');
    setEditCodeDescription('');
    setEditCodeColor('#2f80ed');
    setEditCodeParentId('');
  };

  const saveCodeEdit = (code: Code) => {
    if (!editCodeLabel.trim()) return;
    updateCode(code.id, {
      label: editCodeLabel.trim(),
      description: editCodeDescription.trim() || undefined,
      color: editCodeColor,
      parentId: editCodeParentId || undefined,
    });
    cancelCodeEdit();
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
          <div className="toolbar">
            <button className="ghost-button" type="button" onClick={() => codebookInputRef.current?.click()}>
              <Upload size={17} />
              {t('qda.importCodebookCsv')}
            </button>
            <button className="primary-button" type="button" onClick={submitCode}>
              <Plus size={17} />
              {t('qda.addCode')}
            </button>
          </div>
        </div>
        <div className="panel-body">
          <input
            ref={codebookInputRef}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importCodebookCsv(file);
              event.currentTarget.value = '';
            }}
          />
          {codebookImportMessage && <span className="muted">{codebookImportMessage}</span>}
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
            <div
              className={editingCodeId === code.id ? 'code-row code-row-editing' : 'code-row'}
              key={code.id}
              style={{ marginLeft: `${Math.min(codeDepth(code.id), 4) * 14}px` }}
            >
              {editingCodeId === code.id ? (
                <>
                  <div className="field-grid">
                    <label className="field">
                      <span>{t('qda.codeLabel')}</span>
                      <input className="text-input" value={editCodeLabel} onChange={(event) => setEditCodeLabel(event.target.value)} />
                    </label>
                    <label className="field">
                      <span>{t('qda.color')}</span>
                      <input className="text-input" type="color" value={editCodeColor} onChange={(event) => setEditCodeColor(event.target.value)} />
                    </label>
                  </div>
                  <label className="field">
                    <span>{t('qda.description')}</span>
                    <input className="text-input" value={editCodeDescription} onChange={(event) => setEditCodeDescription(event.target.value)} />
                  </label>
                  <label className="field">
                    <span>{t('qda.parentCode')}</span>
                    <select className="select-input" value={editCodeParentId} onChange={(event) => setEditCodeParentId(event.target.value)}>
                      <option value="">{t('qda.noParent')}</option>
                      {parentOptions(code.id).map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          {'- '.repeat(codeDepth(candidate.id))}
                          {candidate.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="toolbar">
                    <button className="primary-button" type="button" disabled={!editCodeLabel.trim()} onClick={() => saveCodeEdit(code)}>
                      {t('common.save')}
                    </button>
                    <button className="ghost-button" type="button" onClick={cancelCodeEdit}>
                      {t('common.cancel')}
                    </button>
                    <button
                      className="danger-button"
                      type="button"
                      onClick={() => {
                        removeCode(code.id);
                        cancelCodeEdit();
                      }}
                    >
                      <Trash2 size={16} />
                      {t('common.delete')}
                    </button>
                  </div>
                </>
              ) : (
                <>
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
                  <div className="toolbar">
                    <button className="icon-button" type="button" title={t('qda.editCode')} onClick={() => openCodeEdit(code)}>
                      <Edit3 size={16} />
                    </button>
                    <button className="icon-button" type="button" title={t('common.delete')} onClick={() => removeCode(code.id)}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </>
              )}
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
          <h2 className="section-title">{t('qda.autoCoding')}</h2>
          <div className="toolbar">
            <button className="ghost-button" type="button" disabled={!documents.length || !codes.length} onClick={generateAutoCodeSuggestions}>
              <Sparkles size={16} />
              {t('qda.generateSuggestions')}
            </button>
            <button className="primary-button" type="button" disabled={!autoCodeSuggestions.length} onClick={applyAllAutoCodeSuggestions}>
              <CheckCircle2 size={16} />
              {t('qda.applyAllSuggestions')}
            </button>
          </div>
        </div>
        <div className="panel-body">
          <span className="muted">{t('qda.autoCodingHint')}</span>
          <div className="field-grid">
            <label className="field">
              <span>{t('qda.minConfidence')}</span>
              <input
                className="text-input"
                type="number"
                min="0.45"
                max="0.95"
                step="0.01"
                value={minConfidence}
                onChange={(event) => setMinConfidence(Number(event.target.value))}
              />
            </label>
            <label className="field">
              <span>{t('qda.suggestionLimit')}</span>
              <input
                className="text-input"
                type="number"
                min="10"
                max="250"
                step="10"
                value={suggestionLimit}
                onChange={(event) => setSuggestionLimit(Number(event.target.value))}
              />
            </label>
          </div>
          {autoCodeMessage && <span className="muted">{autoCodeMessage}</span>}
          {autoCodeSuggestions.length === 0 ? (
            <div className="empty-state">{t('qda.noSuggestions')}</div>
          ) : (
            <div className="table-wrap">
              <table className="analysis-table">
                <thead>
                  <tr>
                    <th>{t('qda.document')}</th>
                    <th>{t('qda.codeLabel')}</th>
                    <th>{t('qda.confidence')}</th>
                    <th>{t('qda.range')}</th>
                    <th>{t('qda.selectedText')}</th>
                    <th>{t('common.action')}</th>
                  </tr>
                </thead>
                <tbody>
                  {autoCodeSuggestions.map((suggestion) => (
                    <tr key={suggestion.id}>
                      <td>{suggestion.documentName}</td>
                      <td>
                        <span className="code-pill" style={{ borderColor: suggestion.codeColor }}>
                          <span className="color-chip small" style={{ background: suggestion.codeColor }} />
                          {suggestion.codeLabel}
                        </span>
                      </td>
                      <td>{Math.round(suggestion.confidence * 100)}%</td>
                      <td>{suggestion.start}-{suggestion.end}</td>
                      <td>{suggestion.excerpt}</td>
                      <td>
                        <button className="ghost-button" type="button" onClick={() => applyAutoCodeSuggestion(suggestion)}>
                          <CheckCircle2 size={16} />
                          {t('qda.applySuggestion')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section className="panel span-all">
        <div className="panel-header">
          <h2 className="section-title">{t('qda.codeAnalysis')}</h2>
          <div className="toolbar">
            <button className="ghost-button" type="button" disabled={!documents.length || !codes.length} onClick={() => annotationInputRef.current?.click()}>
              <Upload size={16} />
              {t('qda.importAnnotationsCsv')}
            </button>
            <button className="ghost-button" type="button" disabled={!insightRows().length} onClick={exportInsightsCsv}>
              <FileDown size={16} />
              {t('qda.exportInsightsCsv')}
            </button>
            <button className="ghost-button" type="button" disabled={!mixedMethodRows().length} onClick={exportMixedMethodsCsv}>
              <FileDown size={16} />
              {t('qda.exportMixedMethodsCsv')}
            </button>
            <button className="ghost-button" type="button" disabled={!codes.length} onClick={exportCodebookCsv}>
              <Download size={16} />
              {t('qda.exportCodebookCsv')}
            </button>
            <button className="ghost-button" type="button" disabled={!annotationRows().length} onClick={exportAnnotationsCsv}>
              <Download size={16} />
              {t('qda.exportAnnotationsCsv')}
            </button>
          </div>
        </div>
        <div className="panel-body">
          <input
            ref={annotationInputRef}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importAnnotationsCsv(file);
              event.currentTarget.value = '';
            }}
          />
          {annotationImportMessage && <span className="muted">{annotationImportMessage}</span>}
          <div className="insight-grid">
            <div className="insight-tile">
              <span>{t('qda.corpusCoverage')}</span>
              <strong>{formatPercent(corpusCoverage)}</strong>
            </div>
            <div className="insight-tile">
              <span>{t('qda.annotationCount')}</span>
              <strong>{annotations.length}</strong>
            </div>
            <div className="insight-tile">
              <span>{t('qda.codeCooccurrence')}</span>
              <strong>{cooccurrenceRows.length}</strong>
            </div>
            <div className="insight-tile">
              <span>{t('qda.codeKeywordLinks')}</span>
              <strong>{codeKeywordRows.length}</strong>
            </div>
            <div className="insight-tile">
              <span>{t('qda.keywordHits')}</span>
              <strong>{mixedEvidenceRows.length}</strong>
            </div>
            <div className="insight-tile">
              <span>{t('qda.auditIssue')}</span>
              <strong>{auditFindings.filter((finding) => finding.severity !== 'ok').length}</strong>
            </div>
          </div>

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
                  <th>{t('qda.corpusCoverage')}</th>
                  <th>{t('qda.annotationCount')}</th>
                  <th>{t('qda.distinctCodes')}</th>
                  <th>{t('qda.codedCharacters')}</th>
                  <th>{t('qda.coverage')}</th>
                </tr>
              </thead>
              <tbody>
                {coverageRows.map((row) => (
                  <tr key={row.documentId}>
                    <td>{row.filename}</td>
                    <td>{row.annotationCount}</td>
                    <td>{row.distinctCodeCount}</td>
                    <td>{row.codedCharacters}</td>
                    <td>{formatPercent(row.coverage)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="field-grid">
            <label className="field">
              <span>{t('qda.caseDimension')}</span>
              <select className="select-input" value={caseDimension} onChange={(event) => setCaseDimension(event.target.value as CaseDimension)}>
                <option value="category">{t('qda.category')}</option>
                <option value="author">{t('qda.author')}</option>
                <option value="language">{t('qda.language')}</option>
                <option value="tag">{t('qda.tag')}</option>
              </select>
            </label>
            <div className="field">
              <span>{t('qda.coverageSummary')}</span>
              <div className="selection-preview">
                <strong>{formatPercent(corpusCoverage)}</strong>
                <p>{t('qda.coverageSummaryDetail', { documents: documents.length, annotations: annotations.length, codes: codes.length })}</p>
              </div>
            </div>
            <div className="field">
              <span>{t('qda.mixedBridgeSummary')}</span>
              <div className="selection-preview">
                <strong>
                  {strongestCodeKeyword
                    ? `${strongestCodeKeyword.codeLabel} × ${strongestCodeKeyword.keywordGroupName}`
                    : t('common.none')}
                </strong>
                <p>
                  {strongestCodeKeyword
                    ? t('qda.mixedBridgeSummaryDetail', {
                      hits: strongestCodeKeyword.hitCount,
                      annotations: strongestCodeKeyword.annotationCount,
                      documents: strongestCodeKeyword.documentCount,
                    })
                    : t('qda.noMixedEvidence')}
                </p>
              </div>
            </div>
          </div>

          <div className="table-wrap">
            <table className="analysis-table heatmap-table" aria-label={t('qda.codeKeywordMatrix')}>
              <thead>
                <tr>
                  <th>
                    <BarChart3 size={15} />
                    {t('qda.codeKeywordMatrix')}
                  </th>
                  {codeKeywordMatrix.groups.map((group) => (
                    <th key={group.id}>{group.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {codeKeywordMatrix.codes.length === 0 || codeKeywordMatrix.groups.length === 0 ? (
                  <tr>
                    <td colSpan={Math.max(1, codeKeywordMatrix.groups.length + 1)}>{t('qda.noMixedEvidence')}</td>
                  </tr>
                ) : (
                  codeKeywordMatrix.codes.map((code) => (
                    <tr key={code.id}>
                      <th>
                        <span className="code-pill" style={{ borderColor: code.color }}>
                          <span className="color-chip small" style={{ background: code.color }} />
                          {code.label}
                        </span>
                      </th>
                      {codeKeywordMatrix.groups.map((group) => {
                        const value = codeKeywordMatrix.counts.get(`${code.id}\u0000${group.id}`) ?? 0;
                        const alpha = value ? Math.min(0.9, 0.12 + (value / codeKeywordMatrix.max) * 0.7) : 0;
                        return (
                          <td key={group.id}>
                            <span className="heatmap-cell" style={{ backgroundColor: value ? `rgba(35, 111, 89, ${alpha})` : '#f7f9fb' }}>
                              {value || ''}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="table-wrap">
            <table className="analysis-table">
              <thead>
                <tr>
                  <th>{t('qda.mixedEvidence')}</th>
                  <th>{t('qda.codeLabel')}</th>
                  <th>{t('qda.keywordGroup')}</th>
                  <th>{t('qda.term')}</th>
                  <th>{t('qda.range')}</th>
                  <th>{t('qda.selectedText')}</th>
                </tr>
              </thead>
              <tbody>
                {mixedEvidenceRows.length === 0 ? (
                  <tr>
                    <td colSpan={6}>{t('qda.noMixedEvidence')}</td>
                  </tr>
                ) : (
                  mixedEvidenceRows.slice(0, 80).map((row) => (
                    <tr key={row.id}>
                      <td>{row.documentName}</td>
                      <td>
                        <span className="code-pill" style={{ borderColor: row.codeColor }}>
                          <span className="color-chip small" style={{ background: row.codeColor }} />
                          {row.codeLabel}
                        </span>
                      </td>
                      <td>{row.keywordGroupName}</td>
                      <td>{row.term}</td>
                      <td>{row.start}-{row.end}</td>
                      <td>{row.excerpt}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="table-wrap">
            <table className="analysis-table">
              <thead>
                <tr>
                  <th>{t('qda.caseMatrix')}</th>
                  <th>{t('qda.documentCount')}</th>
                  {codes.map((code) => (
                    <th key={code.id}>{code.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {caseMatrix.map((row) => (
                  <tr key={row.caseName}>
                    <td>{row.caseName}</td>
                    <td>{row.documentCount}</td>
                    {row.counts.map(({ code, count }) => (
                      <td key={code.id}>{count}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="table-wrap">
            <table className="analysis-table heatmap-table" aria-label={t('qda.codeCooccurrence')}>
              <thead>
                <tr>
                  <th>
                    <BarChart3 size={15} />
                    {t('qda.codeCooccurrence')}
                  </th>
                  {cooccurrenceMatrix.codes.map((code) => (
                    <th key={code.id}>{code.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cooccurrenceMatrix.codes.length === 0 ? (
                  <tr>
                    <td colSpan={Math.max(1, codes.length + 1)}>{t('qda.noCooccurrence')}</td>
                  </tr>
                ) : (
                  cooccurrenceMatrix.codes.map((source) => (
                    <tr key={source.id}>
                      <th>{source.label}</th>
                      {cooccurrenceMatrix.codes.map((target) => {
                        const value = source.id === target.id ? 0 : (cooccurrenceMatrix.counts.get(`${source.id}\u0000${target.id}`) ?? 0);
                        const alpha = value ? Math.min(0.9, 0.12 + (value / cooccurrenceMatrix.max) * 0.7) : 0;
                        return (
                          <td key={target.id}>
                            <span className="heatmap-cell" style={{ backgroundColor: value ? `rgba(40, 95, 159, ${alpha})` : '#f7f9fb' }}>
                              {value || ''}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="audit-list">
            {auditFindings.map((finding) => (
              <div className={`audit-row ${finding.severity}`} key={`${finding.issue}-${finding.detail}`}>
                <span className={`badge ${finding.severity}`}>{t(`qda.auditSeverity_${finding.severity}`)}</span>
                <strong>{finding.issue}</strong>
                <span className="muted">{finding.detail}</span>
                <span>{finding.fix}</span>
              </div>
            ))}
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
