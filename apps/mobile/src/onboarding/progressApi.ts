import {
  type CompletedProgress,
  parseCompletedProgress,
  parseSavedProgress,
  type ProgressUpdate,
  type SavedProgress,
} from '@snapdone/onboarding';

import { bearer, getApiBaseUrl } from '../lib/api';

const request = async <T extends SavedProgress>(
  path: string,
  credential: string,
  parse: (value: unknown) => T | null,
  init: RequestInit = {},
): Promise<T | null> => {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: { ...init.headers, ...bearer(credential) },
  });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(`온보딩 진행 요청이 ${response.status}로 실패했습니다.`);
  const progress = parse(await response.json());
  if (!progress) throw new Error('온보딩 진행 응답 형식이 예상과 다릅니다.');
  return progress;
};

/** 온보딩 진행 API. 서버가 세션을 받지 않으면(401) `null`이다. */
export const progressApi = {
  find: (credential: string): Promise<SavedProgress | null> =>
    request('/v1/onboarding', credential, parseSavedProgress),
  save: (credential: string, update: ProgressUpdate): Promise<SavedProgress | null> =>
    request('/v1/onboarding', credential, parseSavedProgress, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update),
    }),
  /** 온보딩을 끝낸다. 다른 기기 · web에서 먼저 마쳤어도 성공이다. */
  complete: (credential: string): Promise<CompletedProgress | null> =>
    request('/v1/onboarding/complete', credential, parseCompletedProgress, { method: 'POST' }),
};
