import {
  MAX_IMAGE_BYTES,
  POLL_INTERVAL_MS,
  ProcessingApiError,
  type ProcessingJob,
  type ProcessingPort,
} from '@snapdone/onboarding';

import { findFirstImageJob, type JobResponse, startFirstImage } from './actions';

/** Action 호출 자체가 실패하면(연결 끊김 · 본문 상한) 응답을 받지 못한 것이다. */
const call = (action: () => Promise<JobResponse>) =>
  action().catch(() => {
    throw new ProcessingApiError('network');
  });

/**
 * 브라우저에서 첫 사진을 처리하는 port. Go 호출은 Server Action이 서버에서 한다.
 * 세션이 끝났으면 `onSignedOut`을 부르고 `null`로 처리를 멈춘다.
 */
export const createProcessingPort = (onSignedOut: () => void): ProcessingPort<File> => {
  const toJob = (response: JobResponse): ProcessingJob | null => {
    if (response.type === 'error') throw new ProcessingApiError(response.code);
    if (response.type === 'signed-out') {
      onSignedOut();
      return null;
    }
    return response.job;
  };

  return {
    start: async (image) => {
      // 서버까지 보내지 않아도 거절될 크기는 여기서 알린다.
      if (image.size > MAX_IMAGE_BYTES) throw new ProcessingApiError('image_too_large');
      const form = new FormData();
      form.append('image', image);
      return toJob(await call(() => startFirstImage(form)));
    },
    find: async (jobId) => toJob(await call(() => findFirstImageJob(jobId))),
    wait: () => new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS)),
  };
};
