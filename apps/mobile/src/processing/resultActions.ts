import type { AuthController } from '../auth/controller';

import { jobApi } from './jobApi';
import { createJobPort } from './port';
import { savePreference } from './preferenceApi';

/**
 * 결과 화면의 조작을 로그인 세션에 묶는다 — 영수증 필드 확정, 다른 방식으로 다시 처리, 기본 처리 방식 저장.
 * 셋은 서로 다른 요청이다. 다시 처리는 저장된 처리 방식을 바꾸지 않고, 저장은 사용자가 고를 때만 따로 부른다.
 * credential은 AuthController 밖으로 나오지 않는다.
 */
export const resultActions = (controller: Pick<AuthController, 'authorized'>) => ({
  confirm: (jobId: string, field: string, value: string) =>
    controller.authorized((credential) => jobApi.resolveField(credential, { jobId, field, value })),
  portFor: (sourceJobId: string, action: string) =>
    createJobPort(controller, jobApi, { sourceJobId, action }),
  savePreference: ({
    imageType,
    appliedAction,
  }: {
    imageType: 'text' | 'receipt';
    appliedAction: string;
  }) => controller.authorized((credential) => savePreference(credential, imageType, appliedAction)),
});
