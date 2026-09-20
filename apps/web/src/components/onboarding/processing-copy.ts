import type { ProcessingFailure } from '@snapdone/onboarding';

/** 처리 중에 보이는 한 문장. 서버가 단계를 알려주지 않으므로 단계를 나누어 보이지 않는다. */
export const PROCESSING_MESSAGE = '사진을 확인하고 있습니다';

/** 처리에 실패했을 때의 제목. 이유와 할 일은 FAILURE_COPY가 말한다. */
export const FAILED_TITLE = '사진을 처리하지 못했습니다';

/** 실패 안내와, 같은 사진으로 다시 시도할 수 있는지. mobile과 같은 문장이다. */
export const FAILURE_COPY: Record<ProcessingFailure, { message: string; retry: boolean }> = {
  unsupported: {
    message: '이 사진 형식은 처리할 수 없습니다. 다른 사진을 선택해 주세요.',
    retry: false,
  },
  'too-large': {
    message: '사진이 너무 커서 처리할 수 없습니다. 다른 사진을 선택해 주세요.',
    retry: false,
  },
  network: { message: '인터넷 연결을 확인한 뒤 다시 시도해 주세요.', retry: true },
  failed: {
    message: '사진을 처리하지 못했습니다. 다시 시도하거나 다른 사진을 선택해 주세요.',
    retry: true,
  },
};
