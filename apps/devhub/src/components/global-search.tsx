'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { IconButton, SearchField, VisuallyHidden } from '@berrypjh/react-ui';

import { buildSearchIndex, search, topResults } from '@/lib/search-index';
import { isSearchShortcut, resultStatus, toSuggestion } from '@/lib/search-view';

import { Icon } from './icon';

const FIELD_ID = 'global-search';

/** Built once per page load from the bundled catalog. */
const index = buildSearchIndex();

/**
 * Global search. The shared SearchField is the combobox (focus stays in the input, arrows move the
 * active option, Enter selects, Escape closes); this adds ⌘K / Ctrl+K and the result count.
 * Below `lg` the field folds behind a search button and opens as a full-width row of the top bar.
 */
export function GlobalSearch() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);

  const all = useMemo(() => search(index, query), [query]);
  const shown = useMemo(() => topResults(all), [all]);
  const byKey = useMemo(() => new Map(shown.map((result) => [result.key, result])), [shown]);

  /** Opens the field (a no-op from `lg`, where it is always shown) and focuses it once shown. */
  const openAndFocus = () => {
    setOpen(true);
    setFocusRequest((count) => count + 1);
  };

  useEffect(() => {
    if (focusRequest === 0) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusRequest]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isSearchShortcut(event)) {
        event.preventDefault();
        openAndFocus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const suggestions = shown.map(toSuggestion);
  const status = resultStatus(query, all.length, shown.length);

  return (
    <>
      <IconButton
        size="sm"
        color="secondary"
        aria-label="검색"
        aria-expanded={open}
        aria-controls={FIELD_ID}
        onClick={() => (open ? setOpen(false) : openAndFocus())}
        className="ml-auto lg:hidden"
      >
        <Icon name="search" />
      </IconButton>
      <div
        id={FIELD_ID}
        className={`w-full max-lg:order-last lg:w-auto lg:min-w-40 lg:max-w-96 lg:flex-[1_1_18rem] ${open ? '' : 'max-lg:hidden'}`}
      >
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
            setOpen(false);
            router.push(result.href);
          }}
        />
        <VisuallyHidden>
          <span role="status">{status}</span>
        </VisuallyHidden>
      </div>
    </>
  );
}
