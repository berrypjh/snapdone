import { type ImageType, parsePreferences, type ProcessingPreferences } from '@snapdone/processing';

import { bearer, getApiBaseUrl } from '../lib/api';

/**
 * 유형 하나의 기본 처리 방식을 저장한다(`PUT /v1/processing-preferences/{imageType}`). 다른 유형의 값은 서버가 그대로 둔다.
 * 저장한 뒤의 전체를 돌려주고, 서버가 세션을 받지 않으면(401) `null`이다. 그 밖의 실패 · 계약 밖 응답은 던진다.
 */
export const savePreference = async (
  credential: string,
  imageType: ImageType,
  action: string,
): Promise<ProcessingPreferences | null> => {
  const response = await fetch(`${getApiBaseUrl()}/v1/processing-preferences/${imageType}`, {
    method: 'PUT',
    headers: { ...bearer(credential), 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(`처리 방식 저장이 ${response.status}로 실패했습니다.`);
  const preferences = parsePreferences(await response.json());
  if (!preferences) throw new Error('처리 방식 응답 형식이 예상과 다릅니다.');
  return preferences;
};
