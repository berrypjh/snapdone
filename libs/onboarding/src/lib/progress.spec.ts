import { describe, expect, it } from 'vitest';

import { parseCompletedProgress, parseSavedProgress } from './progress';

describe('parseSavedProgress', () => {
  it.each(['intro', 'first-image', 'complete'])('reads the %s step', (step) => {
    expect(parseSavedProgress({ step })).toEqual({ step });
  });

  it('drops fields it does not know', () => {
    expect(parseSavedProgress({ step: 'first-image', purposes: ['receipt'] })).toEqual({
      step: 'first-image',
    });
  });

  it.each([null, 'first-image', { step: 'result' }, { step: 'purpose' }, {}])(
    'rejects %j',
    (value) => {
      expect(parseSavedProgress(value)).toBeNull();
    },
  );
});

describe('parseCompletedProgress', () => {
  it('reads a finished onboarding', () => {
    expect(parseCompletedProgress({ step: 'complete' })).toEqual({ step: 'complete' });
  });

  it.each([null, 'complete', { step: 'first-image' }, { error: 'onboarding_out_of_order' }])(
    'rejects %j',
    (value) => {
      expect(parseCompletedProgress(value)).toBeNull();
    },
  );
});
