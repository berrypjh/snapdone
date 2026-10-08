import { parseRecentJobs, type RecentJob } from '@snapdone/processing';

import { bearer, getApiBaseUrl } from '../lib/api';

/** 홈이 읽는 API. 서버가 세션을 받지 않으면(401) `null`이고, 그 밖의 실패 · 계약 밖 응답은 던진다. */
export type HomeApi = {
  recentJobs: (credential: string) => Promise<RecentJob[] | null>;
};

const read = async <T>(
  path: string,
  credential: string,
  parse: (value: unknown) => T | null,
): Promise<T | null> => {
  const response = await fetch(`${getApiBaseUrl()}${path}`, { headers: bearer(credential) });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(`${path} 요청이 ${response.status}로 실패했습니다.`);
  const value = parse(await response.json());
  if (value === null) throw new Error(`${path} 응답 형식이 예상과 다릅니다.`);
  return value;
};

export const homeApi: HomeApi = {
  recentJobs: (credential) => read('/v1/processing-jobs', credential, parseRecentJobs),
};
