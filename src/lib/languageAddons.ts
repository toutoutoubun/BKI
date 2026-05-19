import { invoke } from '@tauri-apps/api/core';

export interface LanguageCreditWarning {
  name?: string;
  license?: string;
  license_type?: 'open' | 'nc' | 'unknown' | string;
  note?: string;
}

export interface LanguageInfo {
  code: string;
  name: string;
  built_in: boolean;
  tokenizer?: string;
  tokenizer_source?: string;
  capabilities: string[];
  license_warnings?: LanguageCreditWarning[];
}

export interface LanguageCatalog {
  languages: LanguageInfo[];
  addons_dir?: string;
  fallback?: boolean;
  error?: string;
}

export const fallbackLanguages: LanguageInfo[] = [
  {
    code: 'en',
    name: 'English',
    built_in: true,
    tokenizer: 'nltk',
    tokenizer_source: 'nltk',
    capabilities: ['frequency', 'kwic', 'sentiment', 'cooccurrence', 'tfidf', 'topic_model', 'similarity', 'lexical_stats', 'ner', 'pos', 'dependency'],
  },
  {
    code: 'ja',
    name: 'Japanese (日本語)',
    built_in: true,
    tokenizer: 'sudachi',
    tokenizer_source: 'sudachi',
    capabilities: ['frequency', 'kwic', 'sentiment', 'cooccurrence', 'tfidf', 'topic_model', 'similarity', 'lexical_stats', 'ner', 'pos'],
  },
  {
    code: 'fr',
    name: 'French (Français)',
    built_in: true,
    tokenizer: 'spacy',
    tokenizer_source: 'spacy',
    capabilities: ['frequency', 'kwic', 'sentiment', 'cooccurrence', 'tfidf', 'topic_model', 'similarity', 'lexical_stats', 'ner', 'pos', 'dependency'],
  },
  {
    code: 'af',
    name: 'Afrikaans',
    built_in: true,
    tokenizer: 'whitespace',
    tokenizer_source: 'whitespace',
    capabilities: ['frequency', 'kwic', 'sentiment', 'cooccurrence', 'tfidf', 'topic_model', 'similarity', 'lexical_stats', 'ner', 'pos'],
  },
];

export async function loadAvailableLanguages(): Promise<LanguageCatalog> {
  try {
    const response = await invoke<LanguageCatalog>('run_python', {
      command: 'get_languages',
      payload: {},
    });
    if (Array.isArray(response.languages) && response.languages.length > 0) {
      return response;
    }
    throw new Error('No languages returned.');
  } catch (error) {
    return {
      languages: fallbackLanguages,
      fallback: true,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
