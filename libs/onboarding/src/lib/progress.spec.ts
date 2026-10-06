import { describe, expect, it } from 'vitest';

import { parseCompletedProgress, parseSavedProgress } from './progress';

describe('parseSavedProgress', () => {
  it.each([
    { step: 'intro', purposes: null },
    { step: 'purpose', purposes: null },
    { step: 'first-image', purposes: [] },
    { step: 'first-image', purposes: ['food', 'receipt'] },
    { step: 'first-image', purposes: ['unsure'] },
    { step: 'complete', purposes: null },
  ])('reads %j', (value) => {
    expect(parseSavedProgress(value)).toEqual(value);
  });

  it('keeps a skip apart from an unanswered purpose', () => {
    expect(parseSavedProgress({ step: 'first-image', purposes: [] })?.purposes).toEqual([]);
    expect(parseSavedProgress({ step: 'purpose', purposes: null })?.purposes).toBeNull();
  });

  it('drops fields it does not know and puts purposes in the fixed order', () => {
    expect(
      parseSavedProgress({ step: 'first-image', purposes: ['work', 'food'], image: 'x' }),
    ).toEqual({ step: 'first-image', purposes: ['food', 'work'] });
  });

  it.each([
    null,
    'first-image',
    { step: 'result', purposes: null },
    { step: 'intro', purposes: [] },
    { step: 'first-image', purposes: null },
    { step: 'first-image' },
    { step: 'first-image', purposes: ['cooking'] },
    { step: 'first-image', purposes: ['food', 'food'] },
    { step: 'first-image', purposes: ['food', 'unsure'] },
  ])('rejects %j', (value) => {
    expect(parseSavedProgress(value)).toBeNull();
  });
});

describe('parseCompletedProgress', () => {
  it.each([
    { step: 'complete', purposes: ['food', 'receipt'] },
    { step: 'complete', purposes: [] },
    { step: 'complete', purposes: null },
  ])('reads %j', (value) => {
    expect(parseCompletedProgress(value)).toEqual(value);
  });

  it.each([
    null,
    'complete',
    { step: 'first-image', purposes: [] },
    { step: 'intro', purposes: null },
    { step: 'complete' },
    { step: 'complete', purposes: ['cooking'] },
    { error: 'onboarding_out_of_order' },
  ])('rejects %j', (value) => {
    expect(parseCompletedProgress(value)).toBeNull();
  });
});
