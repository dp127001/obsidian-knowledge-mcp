/**
 * Search engine integrating multiple search algorithms
 */

import uFuzzy from '@leeoniya/ufuzzy';
import fuzzysort from 'fuzzysort';
import { SearchResult } from '../types/core.js';
import { createSearchPattern, extractSnippet } from './regex-helpers.js';

/**
 * Search engine configuration
 */
export interface SearchEngineConfig {
  fuzzyThreshold?: number; // 0-1, default 0.5
  maxResults?: number;     // default 100
  contextChars?: number;   // snippet context, default 100
}

/**
 * Search index entry
 */
export interface SearchIndexEntry {
  vault: string;
  path: string;
  title: string;
  content: string;
  tags: string[];
  frontmatter: Record<string, any> | null;
}

/**
 * Search engine class
 */
export class SearchEngine {
  private config: Required<SearchEngineConfig>;
  private ufuzzy: uFuzzy;

  constructor(config: SearchEngineConfig = {}) {
    this.config = {
      fuzzyThreshold: config.fuzzyThreshold ?? 0.5,
      maxResults: config.maxResults ?? 100,
      contextChars: config.contextChars ?? 100
    };

    // Initialize uFuzzy with optimized settings
    this.ufuzzy = new uFuzzy({
      intraMode: 1,    // Allow partial matches
      intraIns: 1,     // Allow insertions
      intraSub: 1,     // Allow substitutions
      intraTrn: 1,     // Allow transpositions
      intraDel: 1      // Allow deletions
    });
  }

  /**
   * Exact search using regex patterns
   */
  searchExact(
    entries: SearchIndexEntry[],
    query: string,
    searchIn: ('content' | 'frontmatter' | 'tags' | 'filename')[] = ['content']
  ): SearchResult[] {
    const results: SearchResult[] = [];
    const pattern = createSearchPattern(query, false);

    for (const entry of entries) {
      let matched = false;
      let snippet: string | undefined;

      // Search in content
      if (searchIn.includes('content')) {
        if (pattern.test(entry.content)) {
          matched = true;
          snippet = extractSnippet(entry.content, pattern, this.config.contextChars) || undefined;
        }
      }

      // Search in filename/title
      if (searchIn.includes('filename')) {
        if (pattern.test(entry.title) || pattern.test(entry.path)) {
          matched = true;
        }
      }

      // Search in tags
      if (searchIn.includes('tags')) {
        if (entry.tags.some(tag => pattern.test(tag))) {
          matched = true;
        }
      }

      // Search in frontmatter
      if (searchIn.includes('frontmatter') && entry.frontmatter) {
        const fmString = JSON.stringify(entry.frontmatter);
        if (pattern.test(fmString)) {
          matched = true;
        }
      }

      if (matched) {
        results.push({
          vault: entry.vault,
          path: entry.path,
          title: entry.title,
          score: 1.0, // Exact matches get perfect score
          snippet,
          tags: entry.tags,
          frontmatter: entry.frontmatter || undefined
        });
      }
    }

    return results.slice(0, this.config.maxResults);
  }

  /**
   * Fuzzy search using uFuzzy for content/tags
   */
  searchFuzzyContent(
    entries: SearchIndexEntry[],
    query: string,
    searchIn: ('content' | 'tags')[] = ['content']
  ): SearchResult[] {
    const results: SearchResult[] = [];

    // Build searchable haystack
    const haystack: string[] = [];
    const entryMap: Map<number, SearchIndexEntry> = new Map();

    entries.forEach((entry, idx) => {
      let searchText = '';

      if (searchIn.includes('content')) {
        searchText += entry.content + ' ';
      }

      if (searchIn.includes('tags')) {
        searchText += entry.tags.join(' ') + ' ';
      }

      haystack.push(searchText.trim());
      entryMap.set(idx, entry);
    });

    // Perform fuzzy search
    const idxs = this.ufuzzy.filter(haystack, query);

    if (!idxs || idxs.length === 0) {
      return results;
    }

    const info = this.ufuzzy.info(idxs, haystack, query);
    const order = this.ufuzzy.sort(info, haystack, query);

    // Convert to SearchResults
    for (const idx of order) {
      const entry = entryMap.get(idxs[idx]);
      if (!entry) continue;

      const score = 1 - (info.idx[idx] / 1000); // Normalize score to 0-1

      if (score >= this.config.fuzzyThreshold) {
        results.push({
          vault: entry.vault,
          path: entry.path,
          title: entry.title,
          score,
          tags: entry.tags,
          frontmatter: entry.frontmatter || undefined
        });
      }

      if (results.length >= this.config.maxResults) {
        break;
      }
    }

    return results;
  }

  /**
   * Fuzzy search using fuzzysort for filenames/paths
   */
  searchFuzzyPaths(
    entries: SearchIndexEntry[],
    query: string
  ): SearchResult[] {
    const results: SearchResult[] = [];

    // Prepare targets for fuzzysort
    const targets = entries.map(entry => ({
      entry,
      target: entry.path,
      title: entry.title
    }));

    // Search paths
    const pathResults = fuzzysort.go(query, targets, {
      keys: ['target', 'title'],
      threshold: -10000,
      limit: this.config.maxResults
    });

    for (const result of pathResults) {
      const entry = result.obj.entry;
      const score = result.score / 1000 + 1; // Normalize to 0-1 range

      if (score >= this.config.fuzzyThreshold) {
        results.push({
          vault: entry.vault,
          path: entry.path,
          title: entry.title,
          score,
          tags: entry.tags,
          frontmatter: entry.frontmatter || undefined
        });
      }
    }

    return results;
  }

  /**
   * Hybrid search combining exact and fuzzy
   */
  searchHybrid(
    entries: SearchIndexEntry[],
    query: string,
    searchIn: ('content' | 'frontmatter' | 'tags' | 'filename')[] = ['content']
  ): SearchResult[] {
    // Check if query looks like regex pattern
    const isRegexQuery = /[.*+?^${}()|[\]\\]/.test(query);

    if (isRegexQuery) {
      // Use exact search for regex patterns
      return this.searchExact(entries, query, searchIn);
    }

    // Use hybrid approach for plain keywords
    const exactResults = this.searchExact(entries, query, searchIn);

    // Fuzzy search on content/tags
    const fuzzyContentFields = searchIn.filter(s => s === 'content' || s === 'tags') as ('content' | 'tags')[];
    const fuzzyResults = fuzzyContentFields.length > 0
      ? this.searchFuzzyContent(entries, query, fuzzyContentFields)
      : [];

    // Fuzzy search on filenames
    const fuzzyPathResults = searchIn.includes('filename')
      ? this.searchFuzzyPaths(entries, query)
      : [];

    // Merge results, preferring exact matches
    const mergedMap = new Map<string, SearchResult>();

    // Add exact results first (highest priority)
    for (const result of exactResults) {
      const key = `${result.vault}:${result.path}`;
      mergedMap.set(key, result);
    }

    // Add fuzzy results if not already present
    for (const result of [...fuzzyResults, ...fuzzyPathResults]) {
      const key = `${result.vault}:${result.path}`;
      if (!mergedMap.has(key)) {
        mergedMap.set(key, result);
      }
    }

    // Sort by score descending
    const merged = Array.from(mergedMap.values());
    merged.sort((a, b) => b.score - a.score);

    return merged.slice(0, this.config.maxResults);
  }

  /**
   * Suggest link targets using fuzzy matching
   */
  suggestLinkTargets(
    entries: SearchIndexEntry[],
    linkText: string,
    limit: number = 5
  ): SearchResult[] {
    // Use fuzzysort for path/title matching
    const pathResults = this.searchFuzzyPaths(entries, linkText);

    // Also try content matching for ambiguous links
    const contentResults = this.searchFuzzyContent(entries, linkText, ['content']);

    // Merge and deduplicate
    const mergedMap = new Map<string, SearchResult>();

    for (const result of [...pathResults, ...contentResults]) {
      const key = `${result.vault}:${result.path}`;
      if (!mergedMap.has(key)) {
        mergedMap.set(key, result);
      }
    }

    const suggestions = Array.from(mergedMap.values());
    suggestions.sort((a, b) => b.score - a.score);

    return suggestions.slice(0, limit);
  }
}

/**
 * Create a search engine instance
 */
export function createSearchEngine(config?: SearchEngineConfig): SearchEngine {
  return new SearchEngine(config);
}
