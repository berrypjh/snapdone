import { apiFetch, bearer } from '../api';

import { parsePreferences, type PreferenceUpdate, type ProcessingPreferences } from './preferences';

const request = async (
  path: string,
  credential: string,
  init: RequestInit = {},
): Promise<ProcessingPreferences | null> => {
  const response = await apiFetch(path, {
    ...init,
    headers: { ...init.headers, ...bearer(credential) },
  });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(`처리 방식 요청이 ${response.status}로 실패했습니다.`);
  const preferences = parsePreferences(await response.json());
  if (!preferences) throw new Error('처리 방식 응답 형식이 예상과 다릅니다.');
  return preferences;
};

/** 서버에 저장된 처리 방식. 세션이 끝났으면 `null`이다. */
export const fetchPreferences = (credential: string) =>
  request('/v1/processing-preferences', credential);

/** 이미지 유형 하나의 처리 방식만 바꾸고 바뀐 뒤의 전체를 받는다. 세션이 끝났으면 `null`이다. */
export const savePreference = (credential: string, { imageType, action }: PreferenceUpdate) =>
  request(`/v1/processing-preferences/${imageType}`, credential, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  });
