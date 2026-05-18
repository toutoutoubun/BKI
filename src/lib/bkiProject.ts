import type { Annotation, BkiProjectFile, Code, CorpusDocument, KeywordGroup, SupportedLanguage } from '../types';

const languages: SupportedLanguage[] = ['ja', 'en', 'fr', 'af'];
const groupByValues = ['month', 'year', 'document', 'category'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exists<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function isFrequencyResult(value: unknown): BkiProjectFile['analysis']['frequencyResult'] {
  if (!isRecord(value)) return undefined;
  if (!Array.isArray(value.periods) || !Array.isArray(value.groups) || !isRecord(value.counts)) return undefined;
  return value as unknown as BkiProjectFile['analysis']['frequencyResult'];
}

function text(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function normalizeDocument(value: unknown): CorpusDocument | null {
  if (!isRecord(value)) return null;
  const id = text(value.id);
  const filename = text(value.filename);
  const content = text(value.content);
  if (!id || !filename) return null;
  const metadata = isRecord(value.metadata) ? value.metadata : {};
  const language = text(metadata.language);
  return {
    id,
    filename,
    content,
    metadata: {
      date: text(metadata.date) || undefined,
      author: text(metadata.author) || undefined,
      category: text(metadata.category) || undefined,
      tags: stringArray(metadata.tags),
      language: languages.includes(language as SupportedLanguage) ? (language as SupportedLanguage) : undefined,
    },
  };
}

function normalizeCode(value: unknown): Code | null {
  if (!isRecord(value)) return null;
  const id = text(value.id);
  const label = text(value.label);
  if (!id || !label) return null;
  return {
    id,
    label,
    color: text(value.color, '#2f80ed'),
    description: text(value.description) || undefined,
    parentId: text(value.parentId) || undefined,
  };
}

function normalizeAnnotation(value: unknown, documents: CorpusDocument[], codes: Code[]): Annotation | null {
  if (!isRecord(value)) return null;
  const id = text(value.id);
  const documentId = text(value.documentId);
  const document = documents.find((item) => item.id === documentId);
  if (!id || !document) return null;
  const start = typeof value.start === 'number' ? value.start : Number(value.start);
  const end = typeof value.end === 'number' ? value.end : Number(value.end);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const safeStart = Math.max(0, Math.min(Math.floor(start), document.content.length));
  const safeEnd = Math.max(safeStart, Math.min(Math.floor(end), document.content.length));
  const codeIds = stringArray(value.codeIds).filter((codeId) => codes.some((code) => code.id === codeId));
  if (codeIds.length === 0) return null;
  return {
    id,
    documentId,
    start: safeStart,
    end: safeEnd,
    codeIds,
    memo: text(value.memo) || undefined,
  };
}

function normalizeKeywordGroup(value: unknown): KeywordGroup | null {
  if (!isRecord(value)) return null;
  const id = text(value.id);
  const name = text(value.name);
  if (!id || !name) return null;
  return {
    id,
    name,
    terms: stringArray(value.terms),
  };
}

export function parseBkiProject(value: unknown): BkiProjectFile {
  if (!isRecord(value)) throw new Error('Project file must be a JSON object.');
  const legacyAnalysis = isRecord(value.analysis) ? value.analysis : {};
  const documents = (Array.isArray(value.documents) ? value.documents : []).map(normalizeDocument).filter(exists);
  const codes = (Array.isArray(value.codes) ? value.codes : []).map(normalizeCode).filter(exists);
  const annotations = (Array.isArray(value.annotations) ? value.annotations : [])
    .map((item) => normalizeAnnotation(item, documents, codes))
    .filter(exists);
  const keywordGroups = (Array.isArray(legacyAnalysis.keywordGroups) ? legacyAnalysis.keywordGroups : [])
    .map(normalizeKeywordGroup)
    .filter(exists);
  const groupBy = text(legacyAnalysis.groupBy);
  const safeGroupBy = groupByValues.includes(groupBy as (typeof groupByValues)[number])
    ? (groupBy as BkiProjectFile['analysis']['groupBy'])
    : 'month';

  if (documents.length === 0 && codes.length === 0 && annotations.length === 0) {
    throw new Error('No BKI documents, codes, or annotations were found.');
  }

  return {
    file_type: 'bki.project',
    schema_version: 1,
    app_version: text(value.app_version || value.version, '0.1.0'),
    exported_at: text(value.exported_at, new Date().toISOString()),
    documents,
    selectedIds: stringArray(value.selectedIds).filter((id) => documents.some((document) => document.id === id)),
    codes,
    annotations,
    analysis: {
      keywordGroups,
      frequencyResult: isFrequencyResult(legacyAnalysis.frequencyResult),
      groupBy: safeGroupBy,
      stellarPath: text(legacyAnalysis.stellarPath) || undefined,
    },
  };
}

export function buildBkiProject(project: Omit<BkiProjectFile, 'file_type' | 'schema_version' | 'app_version' | 'exported_at'>): BkiProjectFile {
  return {
    file_type: 'bki.project',
    schema_version: 1,
    app_version: '0.1.0',
    exported_at: new Date().toISOString(),
    ...project,
  };
}
