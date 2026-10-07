import { POLL_INTERVAL_MS, type ProcessingPort } from '@snapdone/onboarding';
import type { JobDetail } from '@snapdone/processing';

import type { AuthController } from '../auth/controller';
import type { SelectedImage } from '../onboarding/capture';

import type { JobApi, Reprocess } from './jobApi';

/**
 * 로그인 세션으로 사진을 처리하는 port. credential은 AuthController 밖으로 나오지 않는다.
 * 세션이 끝났으면 `null`이라 처리가 멈추고, controller가 로그인 화면으로 바꾼다.
 */
export const createJobPort = (
  controller: Pick<AuthController, 'authorized'>,
  api: JobApi,
  /** 있으면 새 처리 대신 원래 작업의 같은 사진을 다시 처리한다(유형 선택 · 다른 방식으로 처리). */
  reprocess?: Reprocess,
): ProcessingPort<SelectedImage, JobDetail> => ({
  start: (image) =>
    controller.authorized((credential) =>
      reprocess ? api.reprocess(credential, image, reprocess) : api.start(credential, image),
    ),
  find: (jobId) => controller.authorized((credential) => api.find(credential, jobId)),
  wait: () => new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS)),
});
