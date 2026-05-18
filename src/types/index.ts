export type SupportedLanguage = 'ja' | 'en' | 'fr' | 'af';

export interface CorpusDocument {
  id: string;
  filename: string;
  content: string;
  metadata: {
    date?: string;
    author?: string;
    category?: string;
    tags: string[];
    language?: SupportedLanguage;
  };
}

export interface Code {
  id: string;
  label: string;
  color: string;
  description?: string;
  parentId?: string;
}

export interface Annotation {
  id: string;
  documentId: string;
  start: number;
  end: number;
  codeIds: string[];
  memo?: string;
}

export interface KeywordGroup {
  id: string;
  name: string;
  terms: string[];
}

export interface FrequencyResult {
  periods: string[];
  months?: string[];
  groups: string[];
  counts: Record<string, Record<string, number>>;
  table?: Array<Record<string, string | number>>;
}

export interface KwicHit {
  document_id: string;
  document_name: string;
  date?: string;
  left: string;
  keyword: string;
  right: string;
  offset: number;
}

export interface PythonResponse<T> {
  error?: string;
  data?: T;
}

