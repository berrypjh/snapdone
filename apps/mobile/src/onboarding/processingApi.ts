import { ProcessingApiError, type ProcessingJob, readJobResponse } from '@snapdone/onboarding';

import { bearer, getApiBaseUrl } from '../lib/api';

import type { SelectedImage } from './capture';

/** 처리 API. 서버가 세션을 받지 않으면(401) `null`이다. */
export type ProcessingApi = {
  start: (credential: string, image: SelectedImage) => Promise<ProcessingJob | null>;
  find: (credential: string, jobId: string) => Promise<ProcessingJob | null>;
};

const request = async (path: string, init: RequestInit): Promise<ProcessingJob | null> => {
  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, init);
  } catch {
    throw new ProcessingApiError('network');
  }
  return readJobResponse(response, await response.json().catch(() => null));
};

export const processingApi: ProcessingApi = {
  start: (credential, image) => {
    const form = new FormData();
    // 형식은 서버가 내용으로 판별한다. 여기서는 파일 주소만 넘긴다.
    form.append('image', { uri: image.uri, name: 'photo', type: 'application/octet-stream' });
    return request('/v1/processing-jobs', {
      method: 'POST',
      headers: bearer(credential),
      body: form,
    });
  },

  find: (credential, jobId) =>
    request(`/v1/processing-jobs/${encodeURIComponent(jobId)}`, { headers: bearer(credential) }),
};
