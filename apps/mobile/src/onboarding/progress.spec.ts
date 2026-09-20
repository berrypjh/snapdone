import { describe, expect, it } from 'vitest';

import type { OnboardingProgress } from './model';
import { fromSaved, toUpdate } from './progress';

describe('fromSaved', () => {
  it('reads the three purpose answers apart', () => {
    expect(fromSaved({ step: 'purpose', purposes: null })).toEqual({
      step: 'purpose',
      purpose: { status: 'unanswered' },
    });
    expect(fromSaved({ step: 'first-image', purposes: [] })).toEqual({
      step: 'first-image',
      purpose: { status: 'skipped' },
    });
    expect(fromSaved({ step: 'first-image', purposes: ['food'] })).toEqual({
      step: 'first-image',
      purpose: { status: 'selected', purposes: ['food'] },
    });
  });

  it('has nothing to resume once onboarding is complete', () => {
    expect(fromSaved({ step: 'complete', purposes: null })).toBeNull();
  });
});

describe('toUpdate', () => {
  it.each<OnboardingProgress>([
    { step: 'intro', purpose: { status: 'unanswered' } },
    { step: 'first-image', purpose: { status: 'skipped' } },
    { step: 'first-image', purpose: { status: 'selected', purposes: ['events', 'receipt'] } },
  ])('round-trips %j through the server shape', (progress) => {
    expect(fromSaved(toUpdate(progress))).toEqual(progress);
  });

  it('sends a skip as an empty list and an unanswered purpose as null', () => {
    expect(toUpdate({ step: 'first-image', purpose: { status: 'skipped' } }).purposes).toEqual([]);
    expect(toUpdate({ step: 'purpose', purpose: { status: 'unanswered' } }).purposes).toBeNull();
  });
});
