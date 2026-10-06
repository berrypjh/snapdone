import type { SaveResponse } from './actions';
import type { ProcessingPreferences } from './preferences';

export type ImageType = keyof ProcessingPreferences;

/** 서버가 마지막으로 확인해 준 이 유형의 값. 저장에 성공했으면 그 응답, 아니면 page가 읽어 온 값이다. */
export const confirmedValue = <T extends ImageType>(
  imageType: T,
  initial: ProcessingPreferences[T],
  result: SaveResponse | null,
): ProcessingPreferences[T] => (result?.type === 'saved' ? result.preferences[imageType] : initial);

/**
 * 영역에 보일 저장 상태.
 * - `unsaved`: 고른 값이 서버 값과 다르다(아직 저장하지 않음)
 * - `saved`: 방금 저장했고 고른 값이 그대로다
 * - `error` · `signed-out`: 마지막 저장이 실패했다
 * - `idle`: 그 밖(처음 열었을 때 · 저장 뒤 같은 값으로 되돌림)
 */
export type SaveStatus = 'idle' | 'unsaved' | 'saved' | 'error' | 'signed-out';

export const saveStatus = (
  selected: string,
  confirmed: string,
  result: SaveResponse | null,
): SaveStatus => {
  if (result?.type === 'error' || result?.type === 'signed-out') return result.type;
  if (selected !== confirmed) return 'unsaved';
  return result?.type === 'saved' ? 'saved' : 'idle';
};
