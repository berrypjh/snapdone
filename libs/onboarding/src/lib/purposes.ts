/**
 * 사용 목적 선택지(기획서 순서). Go `onboarding` 패키지의 목록과 같다.
 * 맛집 / 카페 · 쇼핑 · 여행 · 일정 / 공연 · 영수증 · 외국어 · 업무 자료 · 아직 모르겠어요.
 */
export const PURPOSES = [
  'food',
  'shopping',
  'travel',
  'events',
  'receipt',
  'foreign-language',
  'work',
  'unsure',
] as const;

export type Purpose = (typeof PURPOSES)[number];

export const isPurpose = (value: unknown): value is Purpose =>
  PURPOSES.some((purpose) => purpose === value);

/** 같은 목적을 기준 순서로 한 번씩만 남긴다. */
export const orderPurposes = (purposes: readonly Purpose[]): Purpose[] =>
  PURPOSES.filter((purpose) => purposes.includes(purpose));

/**
 * 목적 하나를 누른 결과. 고른 것을 다시 누르면 해제한다.
 * "아직 모르겠어요"는 혼자만 남고, 다른 목적을 고르면 "아직 모르겠어요"가 풀린다.
 */
export const togglePurpose = (selected: readonly Purpose[], purpose: Purpose): Purpose[] => {
  if (selected.includes(purpose)) return selected.filter((known) => known !== purpose);
  if (purpose === 'unsure') return ['unsure'];
  return orderPurposes([...selected.filter((known) => known !== 'unsure'), purpose]);
};

/** 다음으로 넘길 수 있는 선택인가. 하나 이상이고, "아직 모르겠어요"는 다른 목적과 함께 있지 않다. */
export const isPurposeSelection = (purposes: readonly Purpose[]) =>
  purposes.length > 0 && (!purposes.includes('unsure') || purposes.length === 1);
