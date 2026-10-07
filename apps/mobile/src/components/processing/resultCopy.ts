import {
  type ExpenseFieldName,
  IMAGE_TYPE_LABEL,
  type ImageType,
  RECEIPT_ACTION_LABEL,
  type ReceiptAction,
  type ResultScreen,
  TEXT_ACTION_LABEL,
  type TextAction,
  type TextBlock,
} from '@snapdone/processing';

/** 처리 결과 문구. web 결과 화면과 같은 문장이다. */

export const CAPTURE_TITLE = '처리할 사진을 골라 주세요';
export const CAPTURE_NOTE = '글자나 영수증이 있는 사진 한 장을 올려 주세요.';
export const PREVIEW_NOTE = '사진 속 내용을 확인하고\n설정한 방식에 맞게 처리해드려요.';

const TEXT_DONE: Record<TextAction, string> = {
  extract_and_translate: '텍스트를 추출하고 번역했습니다',
  extract_text: '텍스트를 추출했습니다',
  summarize: '내용을 요약했습니다',
  extract_and_summarize: '텍스트를 추출하고 요약했습니다',
};

const RECEIPT_DONE: Record<ReceiptAction, string> = {
  record_expense: '지출 정보를 정리했습니다',
  extract_text: '영수증의 텍스트를 추출했습니다',
  summarize: '영수증 내용을 요약했습니다',
};

/** 결과 화면의 제목. 처리를 마친 결과는 끝낸 일을, 그 밖에는 지금 상태를 말한다. */
export const resultTitle = (screen: ResultScreen): string => {
  switch (screen.kind) {
    case 'running':
      return '사진을 처리하고 있습니다';
    case 'failed':
      return '사진을 처리하지 못했습니다';
    case 'unsupported':
      return '처리할 수 없는 사진입니다';
    case 'ambiguous':
      return '어떤 사진인지 골라 주세요';
    case 'without-outcome':
      return '사진을 확인했습니다';
    case 'processed':
      if (screen.translationSkipped) return TEXT_DONE.extract_text;
      return screen.applied.imageType === 'text'
        ? TEXT_DONE[screen.applied.appliedAction]
        : RECEIPT_DONE[screen.applied.appliedAction];
  }
};

/** 서버가 이 작업에 적용한 유형과 처리 방식. 예: `텍스트 / 외국어 · 추출 및 번역`. */
export const appliedLabel = ({ applied }: Extract<ResultScreen, { kind: 'processed' }>): string => {
  const action =
    applied.imageType === 'text'
      ? TEXT_ACTION_LABEL[applied.appliedAction]
      : RECEIPT_ACTION_LABEL[applied.appliedAction];
  return `${IMAGE_TYPE_LABEL[applied.imageType]} · ${action}`;
};

export const APPLIED_PREFIX = '적용한 처리 방식';

export const NOTE: Partial<Record<ResultScreen['kind'], string>> = {
  failed: '사진을 다시 올려 처리해 주세요.',
  unsupported: '글자가 있는 사진이나 영수증 사진을 올려 주세요.',
  ambiguous: '텍스트 사진인지 영수증 사진인지 정하지 못했습니다.',
  'without-outcome': '이 기록에는 처리 결과가 없습니다.',
};

export const TRANSLATION_SKIPPED = '이미 한국어로 쓰여 있어 번역하지 않았습니다.';

export const TEXT_TITLE: Record<TextBlock['kind'], string> = {
  original: '원문',
  translation: '번역',
  summary: '요약',
};

export const FACTS_TITLE = '사진에서 찾은 정보';
export const EXPENSE_TITLE = '지출 정보';
export const FIELD_LABEL: Record<ExpenseFieldName, string> = {
  merchant: '가게',
  date: '날짜',
  total: '금액',
  currency: '통화',
  paymentMethod: '결제 수단',
};
export const UNRESOLVED = '사진에서 찾지 못했습니다';
export const UNCERTAIN = '확인 필요';
export const REVIEW_NOTE = '확인이 필요한 정보가 있습니다. 사진과 비교해 확인해 주세요.';

export const CONFIRM_HELP = '사진에서 읽은 값 중 하나를 고르거나 직접 입력해 주세요.';
export const CONFIRM_HELP_NO_CANDIDATE = '사진을 보고 직접 입력해 주세요.';
export const MANUAL_LABEL = '직접 입력';
export const MANUAL_SUBMIT = '입력한 값으로 확인';
export const INPUT_HINT: Record<ExpenseFieldName, string | null> = {
  merchant: null,
  date: '예: 2026-10-07',
  total: '숫자만 입력해 주세요. 예: 12000',
  currency: '통화 코드를 입력해 주세요. 예: KRW',
  paymentMethod: null,
};
export const confirmTitle = (label: string) => `${label} 확인`;
export const confirmed = (label: string) => `${label} 값을 확인했습니다.`;

/** 필드 확인 실패 안내. 오류 코드를 그대로 보이지 않는다. */
export const confirmFailed = (code: string): string =>
  ({
    invalid_receipt_field: '형식이 맞지 않습니다. 안내한 형식으로 다시 입력해 주세요.',
    receipt_field_resolved: '이미 다른 값으로 확인한 정보입니다.',
    job_not_found: '처리 기록을 찾을 수 없습니다.',
    network: '인터넷 연결을 확인한 뒤 다시 시도해 주세요.',
  })[code] ?? '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.';

export const chooseType = (label: string) => `${label} 사진으로 처리`;
export const CHOOSE_ANOTHER = '다른 사진 선택';
export const PROCESS_ANOTHER = '다른 사진 처리';
export const GO_HOME = '홈으로';

/** 다른 방식으로 처리 · 앞으로도 이 방식. web 결과 화면과 같은 문장이다. */
export const REPROCESS_TITLE = '다른 방식으로 처리';
export const ACTION_LEGEND = '처리 방식';
export const CURRENT = '현재 적용';
export const currentAction = (label: string) => `${CURRENT}: ${label}`;
export const REPROCESS = '이 방식으로 다시 처리';
export const REPROCESSING = '같은 사진을 다시 처리하고 있습니다';
export const REPROCESSED = '다른 방식으로 다시 처리했습니다.';
export const remember = (imageType: ImageType) =>
  `앞으로 ${IMAGE_TYPE_LABEL[imageType]} 사진도 이 방식으로 처리`;
export const REMEMBER_HELP =
  '선택하면 기본 처리 설정이 바뀝니다. 선택하지 않으면 이 사진에만 적용합니다.';

/** 다시 처리 실패 안내. 실패 이유를 코드로 보이지 않는다. 이전 결과는 그대로다. */
export const reprocessFailed = (reason: string): string =>
  ({
    network: '인터넷 연결을 확인한 뒤 다시 시도해 주세요. 이전 결과는 그대로입니다.',
    'not-processed': '이 방식으로는 처리하지 못했습니다. 이전 결과는 그대로입니다.',
  })[reason] ?? '다시 처리하지 못했습니다. 이전 결과는 그대로입니다.';

export const SAVING = '기본 처리 방식을 저장하고 있습니다';
export const saved = (imageType: ImageType, label: string) =>
  `앞으로 ${IMAGE_TYPE_LABEL[imageType]} 사진은 이 방식(${label})으로 처리합니다.`;
export const SAVE_FAILED = '결과는 그대로이지만 기본 처리 방식을 저장하지 못했습니다.';
export const RETRY_SAVE = '기본 처리 방식 다시 저장';
