import { createElement } from 'react';

import { search } from '@berrypjh/devhub-ui';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { GlobalSearch } from '../../components/shell/global-search';

import { buildSearchIndex, KIND_LABEL } from './search-index';
import {
  isSearchShortcut,
  NO_MATCH,
  resultStatus,
  SEARCH_SCOPE,
  toSuggestion,
} from './search-view';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const key = (
  key: string,
  modifiers: Partial<Record<'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey', boolean>> = {},
) => ({
  key,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...modifiers,
});

describe('isSearchShortcut', () => {
  it('opens search on Cmd+K and Ctrl+K, in either case', () => {
    expect(isSearchShortcut(key('k', { metaKey: true }))).toBe(true);
    expect(isSearchShortcut(key('k', { ctrlKey: true }))).toBe(true);
    expect(isSearchShortcut(key('K', { metaKey: true }))).toBe(true);
  });

  it('leaves plain typing and other shortcuts alone', () => {
    expect(isSearchShortcut(key('k'))).toBe(false);
    expect(isSearchShortcut(key('j', { metaKey: true }))).toBe(false);
    expect(isSearchShortcut(key('k', { metaKey: true, shiftKey: true }))).toBe(false);
    expect(isSearchShortcut(key('k', { ctrlKey: true, altKey: true }))).toBe(false);
  });
});

describe('toSuggestion', () => {
  it('puts the result kind in the text, not only in color', () => {
    const [top] = search(buildSearchIndex(), 'auth-contracts');
    const suggestion = toSuggestion(top);
    expect(suggestion.id).toBe(top.key);
    expect(suggestion.description.startsWith(`${KIND_LABEL.library} · `)).toBe(true);
  });
});

describe('resultStatus', () => {
  it('announces the count and says when results are capped', () => {
    expect(resultStatus('', 10, 10)).toBe('');
    expect(resultStatus('zzz', 0, 0)).toBe('');
    expect(resultStatus('session', 4, 4)).toBe('결과 4개');
    expect(resultStatus('webview', 125, 30)).toBe('결과 125개, 종류별 상위 30개 표시');
  });
});

describe('search scope wording', () => {
  it('names every indexed kind and nothing the index does not hold', () => {
    for (const label of Object.values(KIND_LABEL)) expect(SEARCH_SCOPE).toContain(label);
    expect(SEARCH_SCOPE).toContain('코드 · 문서 본문은 검색하지 않음');
    expect(SEARCH_SCOPE).not.toMatch(/전체|본문 검색 가능/);
  });

  it('starts the empty state with the words the E2E looks for and says where to go next', () => {
    expect(NO_MATCH.startsWith('일치하는 항목 없음')).toBe(true);
    expect(NO_MATCH).toContain('GitHub 또는 에디터');
  });
});

describe('GlobalSearch markup', () => {
  it('is a labelled, collapsed combobox from the start, with the shortcut and a status region', () => {
    const html = renderToStaticMarkup(createElement(GlobalSearch));
    expect(html.match(/role="combobox"/g)).toHaveLength(1);
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-autocomplete="list"');
    expect(html).toContain('aria-label="저장소 검색"');
    expect(html).toContain('aria-keyshortcuts="Meta+K Control+K"');
    expect(html).toContain('role="status"');
  });

  it('describes the search scope to the input without showing a full-text promise', () => {
    const html = renderToStaticMarkup(createElement(GlobalSearch));
    expect(html).toContain('aria-describedby="global-search-scope"');
    expect(html).toContain(`id="global-search-scope">${SEARCH_SCOPE}<`);
    expect(html).toContain('placeholder="항목 이름 · 경로 · symbol 검색 (⌘K)"');
  });
});
