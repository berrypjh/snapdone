import { IMAGE_TYPE_LABEL, type ImageType } from '@snapdone/processing';

export const REPROCESS_TITLE = '다른 방식으로 처리';
export const ACTION_LEGEND = '처리 방식';
export const CURRENT = '현재 적용';
export const REPROCESS = '이 방식으로 다시 처리';
export const REPROCESSING = '같은 사진을 다시 처리하고 있습니다';
export const REPROCESSED = '다른 방식으로 다시 처리했습니다.';

/** 이번 사진에만 적용할지, 앞으로도 쓸지. 기본은 선택하지 않음이다. */
export const remember = (imageType: ImageType) =>
  `앞으로 ${IMAGE_TYPE_LABEL[imageType]} 사진도 이 방식으로 처리`;
export const REMEMBER_HELP =
  '선택하면 기본 처리 설정이 바뀝니다. 선택하지 않으면 이 사진에만 적용합니다.';

export const REPROCESS_FAILED: Record<string, string> = {
  network: '인터넷 연결을 확인한 뒤 다시 시도해 주세요. 이전 결과는 그대로입니다.',
  'not-processed': '이 방식으로는 처리하지 못했습니다. 이전 결과는 그대로입니다.',
};
export const REPROCESS_FAILED_DEFAULT = '다시 처리하지 못했습니다. 이전 결과는 그대로입니다.';

export const SAVING = '기본 처리 방식을 저장하고 있습니다';
export const saved = (imageType: ImageType, label: string) =>
  `앞으로 ${IMAGE_TYPE_LABEL[imageType]} 사진은 이 방식(${label})으로 처리합니다.`;
export const SAVE_FAILED = '결과는 그대로이지만 기본 처리 방식을 저장하지 못했습니다.';
export const RETRY_SAVE = '기본 처리 방식 다시 저장';
export const SIGNED_OUT = '로그인이 끝났습니다. 다시 로그인해 주세요.';
export const LOGIN_AGAIN = '다시 로그인';
