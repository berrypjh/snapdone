import {
  type ImageType,
  type JobDetail,
  parseRecentJobs,
  readJobDetail,
  type RecentJob,
} from '@snapdone/processing';

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

const readDetail = async (response: Response): Promise<JobDetail | null> =>
  readJobDetail(response, await response.json().catch(() => null));

/** 작업 하나와 그 결과. 없거나 다른 사용자의 작업이면 `job_not_found`를 던진다. */
export const fetchJob = async (credential: string, jobId: string): Promise<JobDetail | null> =>
  readDetail(
    await apiFetch(`/v1/processing-jobs/${encodeURIComponent(jobId)}`, {
      headers: bearer(credential),
    }),
  );

/** 사진 한 장의 처리를 시작한다. 사진은 multipart 필드 `image` 하나다. 출처(온보딩 · 일반)는 서버가 정한다. */
export const startJob = async (credential: string, image: Blob): Promise<JobDetail | null> => {
  const form = new FormData();
  form.append('image', image);
  return readDetail(
    await apiFetch('/v1/processing-jobs', {
      method: 'POST',
      headers: bearer(credential),
      body: form,
    }),
  );
};

/**
 * 같은 사진을 원래 작업으로 다시 처리한다. 유형을 고르면(ambiguous) 그 유형의 저장된 처리 방식으로,
 * 처리 방식을 고르면 그 처리 방식으로 처리한다. 서버가 같은 사진인지 확인하고, 저장된 처리 방식은 바꾸지 않는다.
 */
export const reprocessJob = async (
  credential: string,
  request: { image: Blob; sourceJobId: string; imageType?: ImageType; action?: string },
): Promise<JobDetail | null> => {
  const form = new FormData();
  form.append('image', request.image);
  form.append('sourceJobId', request.sourceJobId);
  if (request.imageType) form.append('imageType', request.imageType);
  if (request.action) form.append('action', request.action);
  return readDetail(
    await apiFetch('/v1/processing-jobs', {
      method: 'POST',
      headers: bearer(credential),
      body: form,
    }),
  );
};

/** 영수증 필드 하나를 확정하고 바뀐 뒤의 작업을 돌려준다. 다른 필드는 서버가 그대로 둔다. */
export const resolveReceiptField = async (
  credential: string,
  request: { jobId: string; field: string; value: string },
): Promise<JobDetail | null> =>
  readDetail(
    await apiFetch(
      `/v1/processing-jobs/${encodeURIComponent(request.jobId)}/receipt-fields/${encodeURIComponent(request.field)}`,
      {
        method: 'PATCH',
        headers: { ...bearer(credential), 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: request.value }),
      },
    ),
  );
