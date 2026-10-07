import { isRecord } from './record';

/** 텍스트 · 외국어 사진의 처리 방식. Go `preference.TextAction`과 같은 값이다. */
export const TEXT_ACTIONS = [
  'extract_and_translate',
  'extract_text',
  'summarize',
  'extract_and_summarize',
] as const;

/** 영수증 사진의 처리 방식. Go `preference.ReceiptAction`과 같은 값이다. */
export const RECEIPT_ACTIONS = ['record_expense', 'extract_text', 'summarize'] as const;

export type TextAction = (typeof TEXT_ACTIONS)[number];
export type ReceiptAction = (typeof RECEIPT_ACTIONS)[number];

/** 서버가 가진 처리 방식 전체. 고른 적이 없으면 서버 기본값이 온다 — 앱이 기본값을 만들지 않는다. */
export type ProcessingPreferences = { text: TextAction; receipt: ReceiptAction };

export const isTextAction = (value: unknown): value is TextAction =>
  TEXT_ACTIONS.some((action) => action === value);

export const isReceiptAction = (value: unknown): value is ReceiptAction =>
  RECEIPT_ACTIONS.some((action) => action === value);

/** Go 응답을 처리 방식으로 읽는다. 계약 밖이면 `null`이다. */
export const parsePreferences = (value: unknown): ProcessingPreferences | null =>
  isRecord(value) && isTextAction(value.text) && isReceiptAction(value.receipt)
    ? { text: value.text, receipt: value.receipt }
    : null;

/** 사진 종류 이름. 처리 설정 화면 · 홈이 같은 말을 쓴다. */
export const IMAGE_TYPE_LABEL: Record<keyof ProcessingPreferences, string> = {
  text: '텍스트 / 외국어',
  receipt: '영수증',
};

/** 처리 방식 이름. 화면에 보이는 말은 여기 하나에서 온다. */
export const TEXT_ACTION_LABEL: Record<TextAction, string> = {
  extract_and_translate: '추출 및 번역',
  extract_text: '텍스트만 추출',
  summarize: '요약',
  extract_and_summarize: '추출 및 요약',
};

export const RECEIPT_ACTION_LABEL: Record<ReceiptAction, string> = {
  record_expense: '지출 정보로 정리',
  extract_text: '텍스트만 추출',
  summarize: '요약',
};

/** 유형에 고를 수 있는 처리 방식. 다른 유형의 처리 방식은 섞지 않는다. 처리 설정 화면과 같은 순서다. */
export const actionsFor = (imageType: keyof ProcessingPreferences): readonly string[] =>
  imageType === 'text' ? TEXT_ACTIONS : RECEIPT_ACTIONS;

/** 처리 방식 이름. 유형에 없는 처리 방식이면 `null`이다. */
export const actionLabel = (
  imageType: keyof ProcessingPreferences,
  action: string,
): string | null => {
  if (imageType === 'text') return isTextAction(action) ? TEXT_ACTION_LABEL[action] : null;
  return isReceiptAction(action) ? RECEIPT_ACTION_LABEL[action] : null;
};
