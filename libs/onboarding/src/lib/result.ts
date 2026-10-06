import type { ProcessingResult } from './processing';

/**
 * 첫 결과 화면(ON-06)이 보일 것. 사진에서 확인한 것까지이고, 실행한 일은 없다.
 * 신뢰도 단계 · category · action 원래 값은 담지 않는다 — 화면에 내보내지 않는 값이다.
 */
export type ResultPresentation = {
  /** 사진 종류. 지금 지원하는 종류가 아니면 `null`이다 — 무엇이라고 단정하지 않는다. */
  kind: string | null;
  /** 서버가 읽은 값 그대로, 같은 순서다. */
  facts: readonly { label: string; value: string }[];
  /** 할 수 있는 일의 이름. 추천일 뿐 실행하지 않았다. 지원 범위 밖이면 `null`이다. */
  suggestion: string | null;
  /** 일부 정보를 사진과 함께 확인해야 하는가. 어느 값인지는 알 수 없다. */
  needsReview: boolean;
};

type Category = ProcessingResult['category'];
type Action = ProcessingResult['suggestedAction'];

/** 지금 지원하는 종류. 나머지(place · event 등)는 과거 기능을 광고하지 않도록 이름을 붙이지 않는다. */
const KINDS: Partial<Record<Category, string>> = {
  receipt: '영수증',
  foreign_text: '텍스트 / 외국어',
};

/** 종류마다 이름을 붙일 수 있는 추천 하나. 짝이 맞지 않으면 보이지 않는다. */
const SUGGESTIONS: Partial<Record<Category, { action: Action; label: string }>> = {
  receipt: { action: 'record_expense', label: '지출 정보 정리' },
  foreign_text: { action: 'translate', label: '번역' },
};

/** 처리 결과를 첫 결과 화면의 내용으로 바꾼다. 서버가 주지 않은 값은 만들지 않는다. */
export const presentResult = (result: ProcessingResult): ResultPresentation => {
  const suggestion = SUGGESTIONS[result.category];
  return {
    kind: KINDS[result.category] ?? null,
    facts: result.facts.map(({ label, value }) => ({ label, value })),
    suggestion: suggestion?.action === result.suggestedAction ? suggestion.label : null,
    needsReview: result.confidence !== 'high',
  };
};
