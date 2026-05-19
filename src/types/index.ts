export type BuiltInLanguage = 'ja' | 'en' | 'fr' | 'af';
export type SupportedLanguage = BuiltInLanguage | (string & {});

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

export interface PreprocessOptions {
  normalize: boolean;
  lowercase: boolean;
  punctuation: boolean;
  stopwords: boolean;
  stemming: boolean;
}

export interface PreprocessDocumentStats {
  document_id: string;
  filename: string;
  language?: SupportedLanguage;
  original_characters: number;
  processed_characters: number;
  changed: boolean;
  removed_stopwords: number;
  stopwords_source?: string;
  stemmed_terms: number;
  stemming_fallback: boolean;
}

export interface PreprocessStats {
  document_count: number;
  changed_documents: number;
  original_characters: number;
  processed_characters: number;
  character_delta: number;
  removed_stopwords: number;
  stopwords_sources?: string[];
  stemmed_terms: number;
  stemming_fallback: boolean;
  per_document: PreprocessDocumentStats[];
  options: PreprocessOptions;
}

export interface PreprocessResult {
  documents: CorpusDocument[];
  stats: PreprocessStats;
  backend?: 'python' | 'browser';
}

export interface PythonResponse<T> {
  error?: string;
  data?: T;
}

export interface BkiProjectFile {
  file_type: 'bki.project';
  schema_version: 1;
  app_version: string;
  exported_at: string;
  documents: CorpusDocument[];
  selectedIds?: string[];
  codes: Code[];
  annotations: Annotation[];
  analysis: {
    keywordGroups: KeywordGroup[];
    frequencyResult?: FrequencyResult;
    groupBy?: 'month' | 'year' | 'document' | 'category';
    stellarPath?: string;
  };
}
