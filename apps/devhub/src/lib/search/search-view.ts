import { KIND_LABEL, type SearchResult } from './search-index';

/**
 * 로컬 `GlobalSearch`의 단축키 · 결과 알림. 공용 `GlobalSearch`(1.2.0)는 단축키 표시가 hydration에서 어긋나
 * 아직 로컬 컴포넌트를 쓰고, 이 helper도 그 컴포넌트와 함께 남는다. 고친 릴리스로 바꿀 때 함께 지운다.
 */
type ShortcutEvent = Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>;

/** macOS는 ⌘K, 나머지는 Ctrl+K. 다른 보조키 조합은 브라우저에 맡긴다. */
export const isSearchShortcut = (event: ShortcutEvent) =>
  (event.metaKey || event.ctrlKey) &&
  !event.altKey &&
  !event.shiftKey &&
  event.key.toLowerCase() === 'k';

/**
 * 검색이 보는 범위. 색인은 `search-index.ts`가 카탈로그에서 만들고, 종류 이름은 그 `KIND_LABEL`에서 그대로
 * 가져오므로 종류가 늘면 이 문장도 따라온다. 문서 본문 · 소스 코드 내용은 색인에 없다.
 */
export const SEARCH_SCOPE = `${Object.values(KIND_LABEL).join(' · ')}의 이름 · 경로 · 요약만 찾음. 코드 · 문서 본문은 검색하지 않음`;

/** 맞는 것이 없을 때. 왜 없는지와 다음에 갈 곳을 한 줄에 둔다. 첫 구절은 E2E가 찾는 글자다. */
export const NO_MATCH =
  '일치하는 항목 없음 — 항목 이름 · 경로 · symbol · 요약만 찾음. 코드 · 문서 본문은 GitHub 또는 에디터에서 검색';

/** 결과마다 선택지 하나. 종류는 색이 아니라 설명 속 글자로 알린다. */
export const toSuggestion = (result: SearchResult) => ({
  id: result.key,
  label: result.label,
  description: `${KIND_LABEL[result.kind]} · ${result.detail}`,
});

/** 결과 개수를 스크린 리더에 알리는 문장. 알릴 것이 없으면 빈 문자열이다. */
export const resultStatus = (query: string, total: number, shown: number) => {
  if (!query.trim() || total === 0) return '';
  return total > shown ? `결과 ${total}개, 종류별 상위 ${shown}개 표시` : `결과 ${total}개`;
};
