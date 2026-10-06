import { parseRecentJobs, type RecentJob } from '@snapdone/processing';

import { apiFetch, bearer } from '../api';

/** 온보딩을 마친 뒤 올린 사진의 최근 처리 작업. 세션이 끝났으면 `null`이다. */
export const fetchRecentJobs = async (credential: string): Promise<RecentJob[] | null> => {
  const response = await apiFetch('/v1/processing-jobs', { headers: bearer(credential) });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(`처리 기록 요청이 ${response.status}로 실패했습니다.`);
  const jobs = parseRecentJobs(await response.json());
  if (!jobs) throw new Error('처리 기록 응답 형식이 예상과 다릅니다.');
  return jobs;
};
