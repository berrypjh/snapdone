import {
  isReceiptAction,
  isTextAction,
  type ReceiptAction,
  type TextAction,
} from '@snapdone/processing';

/** 이미지 유형 하나의 변경. 유형마다 고를 수 있는 값이 다르다. */
export type PreferenceUpdate =
  { imageType: 'text'; action: TextAction } | { imageType: 'receipt'; action: ReceiptAction };

/** 폼에서 받은 유형 · 처리 방식을 변경으로 읽는다. 유형에 없는 처리 방식이면 `null`이다. */
export const parseUpdate = (imageType: unknown, action: unknown): PreferenceUpdate | null => {
  if (imageType === 'text' && isTextAction(action)) return { imageType, action };
  if (imageType === 'receipt' && isReceiptAction(action)) return { imageType, action };
  return null;
};
