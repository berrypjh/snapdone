import { ProcessingApiError } from '@snapdone/onboarding';
import { type JobDetail, readJobDetail } from '@snapdone/processing';

import { bearer, getApiBaseUrl } from '../lib/api';
import { photoForm } from '../lib/photoForm';

import type { SelectedImage } from './capture';

/** 처리 API. 온보딩 첫 사진도 일반 사진과 같은 처리 결과(`JobDetail`)를 받는다. 서버가 세션을 받지 않으면(401) `null`이다. */
export type ProcessingApi = {
  start: (credential: string, image: SelectedImage) => Promise<JobDetail | null>;
  find: (credential: string, jobId: string) => Promise<JobDetail | null>;
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

export const processingApi: ProcessingApi = {
  start: (credential, image) => {
    return request('/v1/processing-jobs', {
      method: 'POST',
      headers: bearer(credential),
      body: photoForm(image.uri),
    });
  },

  find: (credential, jobId) =>
    request(`/v1/processing-jobs/${encodeURIComponent(jobId)}`, { headers: bearer(credential) }),
};
