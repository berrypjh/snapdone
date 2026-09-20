import { KIND_LABEL, type SearchResult } from './search-index';

type ShortcutEvent = Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>;

/** macOS는 ⌘K, 나머지는 Ctrl+K. 다른 보조키 조합은 브라우저에 맡긴다. */
export const isSearchShortcut = (event: ShortcutEvent) =>
  (event.metaKey || event.ctrlKey) &&
  !event.altKey &&
  !event.shiftKey &&
  event.key.toLowerCase() === 'k';

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
