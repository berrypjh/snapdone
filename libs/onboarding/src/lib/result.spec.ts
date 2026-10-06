import { describe, expect, it } from 'vitest';

import type { ProcessingResult } from './processing';
import { presentResult } from './result';

const receipt: ProcessingResult = {
  category: 'receipt',
  facts: [
    { label: '금액', value: '12,000원' },
    { label: '가게', value: '성수 ○○카페' },
  ],
  suggestedAction: 'record_expense',
  confidence: 'high',
};

const foreignText: ProcessingResult = {
  category: 'foreign_text',
  facts: [{ label: '문장', value: 'Exit only' }],
  suggestedAction: 'translate',
  confidence: 'high',
};

/** 실행했다고 읽힐 수 있는 말. 추천 이름에 들어가면 안 된다. */
const DONE = /완료|했습니다|저장됨|적용/;

describe('presentResult', () => {
  it('names a receipt and suggests organizing the expense without claiming it was done', () => {
    const presentation = presentResult(receipt);

    expect(presentation).toEqual({
      kind: '영수증',
      facts: receipt.facts,
      suggestion: '지출 정보 정리',
      needsReview: false,
    });
    expect(presentation.suggestion).not.toMatch(DONE);
  });

  it('names foreign text and suggests a translation without claiming it was translated', () => {
    const presentation = presentResult(foreignText);

    expect(presentation).toEqual({
      kind: '텍스트 / 외국어',
      facts: foreignText.facts,
      suggestion: '번역',
      needsReview: false,
    });
    expect(presentation.suggestion).not.toMatch(DONE);
  });

  it('keeps the server facts in order, unchanged, and adds none', () => {
    const facts = [
      { label: '날짜', value: '2026. 8. 16.' },
      { label: '금액', value: '12,000원' },
      { label: '금액', value: '3,000원' },
    ];

    expect(presentResult({ ...receipt, facts }).facts).toEqual(facts);
    expect(presentResult({ ...receipt, facts: [] }).facts).toEqual([]);
  });

  it('copies facts so the screen cannot change the result', () => {
    const presentation = presentResult(receipt);

    expect(presentation.facts).not.toBe(receipt.facts);
    expect(presentation.facts[0]).not.toBe(receipt.facts[0]);
  });

  it.each(['medium', 'low'] as const)(
    'asks for a check against the photo when %s',
    (confidence) => {
      expect(presentResult({ ...receipt, confidence }).needsReview).toBe(true);
    },
  );

  it('shows no suggestion when the action does not fit the kind', () => {
    expect(presentResult({ ...receipt, suggestedAction: 'translate' }).suggestion).toBeNull();
    expect(presentResult({ ...receipt, suggestedAction: 'none' }).suggestion).toBeNull();
    expect(
      presentResult({ ...foreignText, suggestedAction: 'record_expense' }).suggestion,
    ).toBeNull();
  });

  it.each([
    ['place', 'save_place'],
    ['event', 'add_to_calendar'],
    ['shopping', 'none'],
    ['work', 'none'],
    ['other', 'none'],
  ] as const)('falls back to a neutral result for %s', (category, suggestedAction) => {
    const facts = [{ label: '주소', value: '서울 성동구' }];

    expect(presentResult({ category, facts, suggestedAction, confidence: 'high' })).toEqual({
      kind: null,
      facts,
      suggestion: null,
      needsReview: false,
    });
  });
});
