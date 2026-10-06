'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Icon, search, topResults } from '@berrypjh/devhub-ui';
import { IconButton, SearchField, VisuallyHidden } from '@berrypjh/react-ui';

import { buildSearchIndex } from '@/lib/search/search-index';
import { isSearchShortcut, resultStatus, toSuggestion } from '@/lib/search/search-view';

const FIELD_ID = 'global-search';

/** 번들된 카탈로그에서 페이지 로드마다 한 번 만든다. */
const index = buildSearchIndex();

/**
 * 전역 검색. combobox는 공용 SearchField가 맡고, 여기서는 ⌘K / Ctrl+K와 결과 수를 더한다.
 * `lg` 아래에서는 검색 버튼 뒤로 접혔다가 상단 바의 전체 폭 줄로 열린다.
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

  /** 필드를 열고 보이면 포커스를 준다. `lg`부터는 늘 보이므로 여는 동작은 없는 셈이다. */
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
        className="lg:hidden"
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
          noSuggestionsText={query.trim() ? '일치하는 항목 없음' : undefined}
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
