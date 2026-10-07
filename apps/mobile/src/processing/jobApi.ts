import { ProcessingApiError } from '@snapdone/onboarding';
import { type ImageType, type JobDetail, readJobDetail } from '@snapdone/processing';

import { bearer, getApiBaseUrl } from '../lib/api';
import type { SelectedImage } from '../onboarding/capture';

/** 재처리 요청. 원래 작업과, 고른 유형(ambiguous) 또는 처리 방식(다른 방식으로 처리)이다. */
export type Reprocess = { sourceJobId: string; imageType?: ImageType; action?: string };

/** 처리 작업 API. 응답은 제품 결과가 붙은 작업(`JobDetail`)이다. 서버가 세션을 받지 않으면(401) `null`이다. */
export type JobApi = {
  start: (credential: string, image: SelectedImage) => Promise<JobDetail | null>;
  find: (credential: string, jobId: string) => Promise<JobDetail | null>;
  /**
   * 같은 사진을 원래 작업으로 다시 처리한다. 유형을 고르면(ambiguous) 그 유형의 저장된 처리 방식으로,
   * 처리 방식을 고르면 그 처리 방식으로 처리한다. 서버가 같은 사진인지 확인하고, 저장된 처리 방식은 바꾸지 않는다.
   */
  reprocess: (
    credential: string,
    image: SelectedImage,
    request: Reprocess,
  ) => Promise<JobDetail | null>;
  /** 영수증 필드 하나를 확정하고 바뀐 뒤의 작업을 돌려준다. */
  resolveField: (
    credential: string,
    request: { jobId: string; field: string; value: string },
  ) => Promise<JobDetail | null>;
};

const request = async (path: string, init: RequestInit): Promise<JobDetail | null> => {
  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, init);
  } catch {
    throw new ProcessingApiError('network');
  }
  return readJobDetail(response, await response.json().catch(() => null));
};

/** 사진은 기기 안의 파일 주소만 넘긴다. 형식은 서버가 내용으로 판별한다. */
const photoForm = (image: SelectedImage) => {
  const form = new FormData();
  form.append('image', { uri: image.uri, name: 'photo', type: 'application/octet-stream' });
  return form;
};

const jobPath = (jobId: string) => `/v1/processing-jobs/${encodeURIComponent(jobId)}`;

export const jobApi: JobApi = {
  start: (credential, image) =>
    request('/v1/processing-jobs', {
      method: 'POST',
      headers: bearer(credential),
      body: photoForm(image),
    }),

  find: (credential, jobId) => request(jobPath(jobId), { headers: bearer(credential) }),

  reprocess: (credential, image, { sourceJobId, imageType, action }) => {
    const form = photoForm(image);
    form.append('sourceJobId', sourceJobId);
    if (imageType) form.append('imageType', imageType);
    if (action) form.append('action', action);
    return request('/v1/processing-jobs', {
      method: 'POST',
      headers: bearer(credential),
      body: form,
    });
  },

  resolveField: (credential, { jobId, field, value }) =>
    request(`${jobPath(jobId)}/receipt-fields/${encodeURIComponent(field)}`, {
      method: 'PATCH',
      headers: { ...bearer(credential), 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    }),
};
