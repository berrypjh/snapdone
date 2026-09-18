'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { SearchField, VisuallyHidden } from '@berrypjh/react-ui';

import { buildSearchIndex, search, topResults } from '@/lib/search-index';
import { isSearchShortcut, resultStatus, toSuggestion } from '@/lib/search-view';

/** Built once per page load from the bundled catalog. */
const index = buildSearchIndex();

/**
 * Global search. The shared SearchField is the combobox (focus stays in the input, arrows move the
 * active option, Enter selects, Escape closes); this adds ⌘K / Ctrl+K and the result count.
 */
export function GlobalSearch() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');

  const all = useMemo(() => search(index, query), [query]);
  const shown = useMemo(() => topResults(all), [all]);
  const byKey = useMemo(() => new Map(shown.map((result) => [result.key, result])), [shown]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isSearchShortcut(event)) {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const suggestions = shown.map(toSuggestion);
  const status = resultStatus(query, all.length, shown.length);

  return (
    <div className="w-96 max-w-full">
      <SearchField
        size="sm"
        variant="boxed"
        fullWidth
        value={query}
        onValueChange={setQuery}
        placeholder="시나리오 · 소스 · 문서 · 테스트 검색 (⌘K)"
        inputRef={inputRef}
        inputProps={{ 'aria-label': '저장소 검색', 'aria-keyshortcuts': 'Meta+K Control+K' }}
        clearable
        clearAriaLabel="검색어 지우기"
        suggestions={suggestions}
        noSuggestionsText={query.trim() ? '일치하는 항목이 없습니다' : undefined}
        onSuggestionSelect={(suggestion) => {
          const result = byKey.get(suggestion.id);
          if (!result) return;
          setQuery('');
          router.push(result.href);
        }}
      />
      <VisuallyHidden>
        <span role="status">{status}</span>
      </VisuallyHidden>
    </div>
  );
}
