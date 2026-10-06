'use server';

import type { ProcessingPreferences } from '@snapdone/processing';

import { fromAllowedOrigin, readCredential } from '../auth/session';

import { savePreference } from './api';
import { parseUpdate } from './preferences';

/**
 * 처리 방식 저장 결과. 오류는 던지지 않고 값으로 돌려준다 — production에서 Action 오류 내용은 가려진다.
 * `saved`는 서버가 저장한 뒤의 전체다.
 */
export type SaveResponse =
  | { type: 'saved'; preferences: ProcessingPreferences }
  | { type: 'signed-out' }
  | { type: 'error' };

/**
 * 이미지 유형 하나의 처리 방식을 저장한다. 폼 필드는 `imageType` · `action`이다.
 * `useActionState`로 쓸 수 있게 이전 결과를 첫 인자로 받는다.
 */
export async function saveProcessingPreference(
  _previous: SaveResponse | null,
  form: FormData,
): Promise<SaveResponse> {
  if (!(await fromAllowedOrigin())) throw new Error('허용되지 않은 origin의 처리 방식 요청입니다.');
  const credential = await readCredential();
  if (!credential) return { type: 'signed-out' };
  const update = parseUpdate(form.get('imageType'), form.get('action'));
  if (!update) return { type: 'error' };
  try {
    const preferences = await savePreference(credential, update);
    return preferences ? { type: 'saved', preferences } : { type: 'signed-out' };
  } catch {
    return { type: 'error' };
  }
}
