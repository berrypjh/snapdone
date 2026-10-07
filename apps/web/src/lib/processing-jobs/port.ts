import {
  MAX_IMAGE_BYTES,
  POLL_INTERVAL_MS,
  ProcessingApiError,
  type ProcessingPort,
} from '@snapdone/onboarding';
import type { JobDetail } from '@snapdone/processing';

import { type DetailResponse, findJob, startPhotoJob } from './actions';

/** Action 호출 자체가 실패하면(연결 끊김 · 본문 상한) 응답을 받지 못한 것이다. */
const call = (action: () => Promise<DetailResponse>) =>
  action().catch((): DetailResponse => ({ type: 'error', code: 'network' }));

/**
 * 브라우저에서 사진 한 장을 처리하는 port. Go 호출은 Server Action이 서버에서 한다.
 * 온보딩 첫 사진 port와 같은 규칙이고, 작업은 제품 결과가 붙은 모양(`JobDetail`)으로 읽는다.
 * 처음 처리는 `startPhotoJob`, 같은 사진의 재처리는 그 Action과 붙일 필드(`sourceJobId` · `action`)를 넘긴다.
 * 세션이 끝났으면 `onSignedOut`을 부르고 `null`로 처리를 멈춘다.
 */
export const createJobPort = (
  onSignedOut: () => void,
  startAction: (form: FormData) => Promise<DetailResponse> = startPhotoJob,
  fields: Readonly<Record<string, string>> = {},
): ProcessingPort<File, JobDetail> => {
  const toJob = (response: DetailResponse): JobDetail | null => {
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
      for (const [name, value] of Object.entries(fields)) form.append(name, value);
      return toJob(await call(() => startAction(form)));
    },
    find: async (jobId) => toJob(await call(() => findJob(jobId))),
    wait: () => new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS)),
  };
};
