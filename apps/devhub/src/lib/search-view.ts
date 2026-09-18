import { KIND_LABEL, type SearchResult } from './search-index';

type ShortcutEvent = Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>;

/** ⌘K on macOS, Ctrl+K elsewhere. Other modifiers are left to the browser. */
export const isSearchShortcut = (event: ShortcutEvent) =>
  (event.metaKey || event.ctrlKey) &&
  !event.altKey &&
  !event.shiftKey &&
  event.key.toLowerCase() === 'k';

/** One option per result. The kind is text in the description, never color alone. */
export const toSuggestion = (result: SearchResult) => ({
  id: result.key,
  label: result.label,
  description: `${KIND_LABEL[result.kind]} · ${result.detail}`,
});

/** Screen reader announcement for the result count; empty when there is nothing to announce. */
export const resultStatus = (query: string, total: number, shown: number) => {
  if (!query.trim() || total === 0) return '';
  return total > shown ? `결과 ${total}개, 종류별 상위 ${shown}개 표시` : `결과 ${total}개`;
};
