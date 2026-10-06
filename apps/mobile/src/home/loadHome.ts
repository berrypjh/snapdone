import type { Loaded, ProcessingPreferences, RecentJob } from '@snapdone/processing';

import type { AuthController } from '../auth/controller';

import { type HomeApi, homeApi } from './homeApi';

export type HomeData = { recent: Loaded<RecentJob[]>; preferences: Loaded<ProcessingPreferences> };

/** 읽었으면 그 값, 실패했으면 읽지 못함, 세션이 끝났으면(`null`) `null`이다. */
const loaded = <T>(result: PromiseSettledResult<T | null>): Loaded<T> | null => {
  if (result.status === 'rejected') return { ok: false };
  return result.value === null ? null : { ok: true, value: result.value };
};

/**
 * 처리 기록과 처리 방식을 함께 읽는다. 서로 기다리지 않고, 한쪽이 실패해도 다른 쪽은 쓴다.
 * credential은 `authorized`에만 있다. 세션이 끝났으면 `authorized`가 로그인을 만료시키고 여기서는 `null`이다.
 */
export const loadHome = async (
  authorized: AuthController['authorized'],
  api: HomeApi = homeApi,
): Promise<HomeData | null> => {
  const [recentResult, preferencesResult] = await Promise.allSettled([
    authorized((credential) => api.recentJobs(credential)),
    authorized((credential) => api.preferences(credential)),
  ]);
  const recent = loaded(recentResult);
  const preferences = loaded(preferencesResult);
  return recent && preferences ? { recent, preferences } : null;
};
