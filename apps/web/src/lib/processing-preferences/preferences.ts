import { isRecord } from '../api';

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

/** 서버가 가진 처리 방식 전체. 고른 적이 없으면 서버 기본값이 온다 — web이 기본값을 만들지 않는다. */
export type ProcessingPreferences = { text: TextAction; receipt: ReceiptAction };

/** 이미지 유형 하나의 변경. 유형마다 고를 수 있는 값이 다르다. */
export type PreferenceUpdate =
  { imageType: 'text'; action: TextAction } | { imageType: 'receipt'; action: ReceiptAction };

const isTextAction = (value: unknown): value is TextAction =>
  TEXT_ACTIONS.some((action) => action === value);

const isReceiptAction = (value: unknown): value is ReceiptAction =>
  RECEIPT_ACTIONS.some((action) => action === value);

/** Go 응답을 처리 방식으로 읽는다. 계약 밖이면 `null`이다. */
export const parsePreferences = (value: unknown): ProcessingPreferences | null =>
  isRecord(value) && isTextAction(value.text) && isReceiptAction(value.receipt)
    ? { text: value.text, receipt: value.receipt }
    : null;

/** 폼에서 받은 유형 · 처리 방식을 변경으로 읽는다. 유형에 없는 처리 방식이면 `null`이다. */
export const parseUpdate = (imageType: unknown, action: unknown): PreferenceUpdate | null => {
  if (imageType === 'text' && isTextAction(action)) return { imageType, action };
  if (imageType === 'receipt' && isReceiptAction(action)) return { imageType, action };
  return null;
};
