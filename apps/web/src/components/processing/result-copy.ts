import type { ReceiptAction, TextAction } from '@snapdone/processing';
import type { ExpenseFieldName, TextBlock } from '@snapdone/processing';

export const PAGE_TITLE = '처리 결과';

/** 처리를 마친 화면의 제목. 처리 방식마다 끝낸 일을 말한다. */
export const TEXT_DONE: Record<TextAction, string> = {
  extract_and_translate: '텍스트를 추출하고 번역했습니다',
  extract_text: '텍스트를 추출했습니다',
  summarize: '내용을 요약했습니다',
  extract_and_summarize: '텍스트를 추출하고 요약했습니다',
};

export const RECEIPT_DONE: Record<ReceiptAction, string> = {
  record_expense: '지출 정보를 정리했습니다',
  extract_text: '영수증의 텍스트를 추출했습니다',
  summarize: '영수증 내용을 요약했습니다',
};

/** 번역 처리 방식인데 원문이 이미 한국어였다. 제목은 추출만 한 것으로 쓴다. */
export const TRANSLATION_SKIPPED_TITLE = TEXT_DONE.extract_text;
export const TRANSLATION_SKIPPED = '이미 한국어로 쓰여 있어 번역하지 않았습니다.';

export const DELETE = '기록 삭제';
export const DELETE_CONFIRM = '이 기록을 삭제할까요? 삭제하면 되돌릴 수 없습니다.';
export const DELETE_YES = '삭제';
export const DELETE_CANCEL = '취소';
export const DELETE_FAILED = '삭제하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.';

export const expand = (label: string) => `${label} 전체 보기`;
export const collapse = (label: string) => `${label} 접기`;

export const COPY = '복사';
export const COPIED = '복사했습니다';
export const COPY_FAILED = '복사하지 못했습니다. 글을 길게 눌러 직접 복사해 주세요.';

export const APPLIED_PREFIX = '적용한 처리 방식';

export const TEXT_TITLE: Record<TextBlock['kind'], string> = {
  original: '원문',
  translation: '번역',
  summary: '요약',
};

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
export const confirmLegend = (label: string) => `${label} 확인`;
export const confirmed = (label: string) => `${label} 값을 확인했습니다.`;
export const CONFIRM_FAILED: Record<string, string> = {
  invalid_receipt_field: '형식이 맞지 않습니다. 안내한 형식으로 다시 입력해 주세요.',
  receipt_field_resolved: '이미 다른 값으로 확인한 정보입니다. 화면을 새로 고쳐 확인해 주세요.',
  job_not_found: '처리 기록을 찾을 수 없습니다.',
};
export const CONFIRM_FAILED_DEFAULT = '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.';
export const SIGNED_OUT = '로그인이 끝났습니다. 다시 로그인해 주세요.';
export const LOGIN_AGAIN = '다시 로그인';

export const RUNNING_TITLE = '사진을 처리하고 있습니다';
export const RUNNING_NOTE = '잠시 후 다시 확인해 주세요.';
export const REFRESH = '다시 확인';

export const FAILED_TITLE = '사진을 처리하지 못했습니다';
export const FAILED_NOTE = '사진을 다시 올려 처리해 주세요.';

export const UNSUPPORTED_TITLE = '처리할 수 없는 사진입니다';
export const UNSUPPORTED_NOTE = '글자가 있는 사진이나 영수증 사진을 올려 주세요.';

export const AMBIGUOUS_TITLE = '어떤 사진인지 골라 주세요';
export const AMBIGUOUS_NOTE = '텍스트 사진인지 영수증 사진인지 정하지 못했습니다.';
export const AMBIGUOUS_WITHOUT_PHOTO =
  '이 화면에는 사진이 없어 종류를 고를 수 없습니다. 사진을 다시 올려 처리해 주세요.';
export const chooseType = (label: string) => `${label} 사진으로 처리`;
export const CHOOSE_FAILED: Record<string, string> = {
  image_mismatch: '처음 올린 사진과 달라 이어서 처리하지 못했습니다. 사진을 다시 올려 주세요.',
  job_not_found: '처리 기록을 찾을 수 없습니다.',
};
export const CHOOSE_FAILED_DEFAULT = '이어서 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';

export const WITHOUT_OUTCOME_TITLE = '사진을 확인했습니다';
export const WITHOUT_OUTCOME_NOTE = '이 기록에는 처리 결과가 없습니다.';
export const FACTS_TITLE = '사진에서 찾은 정보';

export const NO_PHOTO = '사진은 저장하지 않아 이 화면에는 보이지 않습니다.';
export const NOT_FOUND = '처리 기록을 찾을 수 없습니다.';
export const LOAD_FAILED = '처리 결과를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';
