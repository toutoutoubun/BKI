import { invoke } from '@tauri-apps/api/core';
import type { CorpusDocument, PreprocessOptions, PreprocessResult, PreprocessStats, SupportedLanguage } from '../types';

const latinStopwords: Record<string, Set<string>> = {
  en: new Set([
    'a',
    'an',
    'and',
    'are',
    'as',
    'at',
    'be',
    'by',
    'for',
    'from',
    'has',
    'he',
    'in',
    'is',
    'it',
    'its',
    'of',
    'on',
    'that',
    'the',
    'to',
    'was',
    'were',
    'will',
    'with',
  ]),
  fr: new Set(['au', 'aux', 'avec', 'ce', 'ces', 'dans', 'de', 'des', 'du', 'elle', 'en', 'est', 'et', 'il', 'la', 'le', 'les', 'pour', 'que', 'qui', 'sur', 'un', 'une']),
  af: new Set(["'n", 'aan', 'as', 'by', 'dat', 'die', 'dit', 'en', 'het', 'hy', 'in', 'is', 'met', 'nie', 'op', 'te', 'van', 'vir', 'was']),
};

function normalize(content: string) {
  return content
    .normalize('NFKC')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cleanPunctuation(content: string) {
  return content
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[—–]/g, '-')
    .replace(/…/g, '...')
    .replace(/([,.;:])\1+/g, '$1')
    .replace(/([!?])\1{2,}/g, '$1$1')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([,.;:!?])([^\s\n])/g, '$1 $2');
}

function stemToken(token: string) {
  const lower = token.toLowerCase();
  for (const suffix of ['ization', 'ational', 'fulness', 'ousness', 'iveness', 'ingly', 'edly', 'ing', 'ed', 'es', 's']) {
    if (lower.endsWith(suffix) && token.length > suffix.length + 3) return token.slice(0, -suffix.length);
  }
  return token;
}

function browserPreprocess(documents: CorpusDocument[], options: PreprocessOptions): PreprocessResult {
  const perDocument: PreprocessStats['per_document'] = [];
  const processedDocuments = documents.map((document) => {
    const language = document.metadata.language ?? 'en';
    const original = document.content;
    let content = original;
    let removedStopwords = 0;
    let stemmedTerms = 0;

    if (options.normalize) content = normalize(content);
    if (options.lowercase) content = content.toLowerCase();
    if (options.stopwords) {
      const stopwords = latinStopwords[language] ?? latinStopwords.en;
      content = content.replace(/\b[\w'-]+\b/gu, (token) => {
        if (stopwords.has(token.toLowerCase())) {
          removedStopwords += 1;
          return '';
        }
        return token;
      });
      content = content.replace(/[ \t]+/g, ' ').replace(/ +\n/g, '\n').trim();
    }
    if (options.stemming && language !== 'ja') {
      content = content.replace(/\b[\w'-]+\b/gu, (token) => {
        const stemmed = stemToken(token);
        if (stemmed !== token) stemmedTerms += 1;
        return stemmed;
      });
    }
    if (options.punctuation) content = cleanPunctuation(content);

    perDocument.push({
      document_id: document.id,
      filename: document.filename,
      language: language as SupportedLanguage,
      original_characters: original.length,
      processed_characters: content.length,
      changed: content !== original,
      removed_stopwords: removedStopwords,
      stopwords_source: options.stopwords ? 'browser_builtin' : 'disabled',
      stemmed_terms: stemmedTerms,
      stemming_fallback: options.stemming,
    });

    return { ...document, content };
  });

  const originalCharacters = perDocument.reduce((sum, item) => sum + item.original_characters, 0);
  const processedCharacters = perDocument.reduce((sum, item) => sum + item.processed_characters, 0);

  return {
    backend: 'browser',
    documents: processedDocuments,
    stats: {
      document_count: processedDocuments.length,
      changed_documents: perDocument.filter((item) => item.changed).length,
      original_characters: originalCharacters,
      processed_characters: processedCharacters,
      character_delta: processedCharacters - originalCharacters,
      removed_stopwords: perDocument.reduce((sum, item) => sum + item.removed_stopwords, 0),
      stopwords_sources: Array.from(new Set(perDocument.map((item) => item.stopwords_source ?? 'disabled'))).sort(),
      stemmed_terms: perDocument.reduce((sum, item) => sum + item.stemmed_terms, 0),
      stemming_fallback: options.stemming,
      per_document: perDocument,
      options,
    },
  };
}

export async function runPreprocess(documents: CorpusDocument[], options: PreprocessOptions): Promise<PreprocessResult> {
  try {
    const response = await invoke<PreprocessResult>('run_python', {
      command: 'preprocess',
      payload: {
        documents,
        options,
      },
    });
    return {
      ...response,
      backend: 'python',
    };
  } catch {
    return browserPreprocess(documents, options);
  }
}
