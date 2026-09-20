import { describe, expect, it } from 'vitest';

import {
  initialProgress,
  type OnboardingEvent,
  type OnboardingProgress,
  onboardingReducer,
  selectedPurposes,
} from './model';

const run = (events: OnboardingEvent[], from: OnboardingProgress = initialProgress) =>
  events.reduce(onboardingReducer, from);

const started = run([{ type: 'start' }]);

describe('initial progress', () => {
  it('starts at the intro with no purpose answer', () => {
    expect(initialProgress).toEqual({ step: 'intro', purpose: { status: 'unanswered' } });
  });
});

describe('start', () => {
  it('moves from the intro to purpose selection', () => {
    expect(started).toEqual({ step: 'purpose', purpose: { status: 'unanswered' } });
  });

  it('ignores a repeated start', () => {
    expect(onboardingReducer(started, { type: 'start' })).toBe(started);
  });

  it('does not move a user who already answered back to purpose selection', () => {
    const answered = run([{ type: 'skip-purpose' }], started);

    expect(onboardingReducer(answered, { type: 'start' })).toBe(answered);
  });
});

describe('purpose answer', () => {
  it('keeps chosen purposes once each in the fixed order and moves to the first image', () => {
    const progress = run(
      [{ type: 'choose-purposes', purposes: ['travel', 'food', 'travel'] }],
      started,
    );

    expect(progress).toEqual({
      step: 'first-image',
      purpose: { status: 'selected', purposes: ['food', 'travel'] },
    });
  });

  it('records a skip and moves to the first image', () => {
    expect(run([{ type: 'skip-purpose' }], started)).toEqual({
      step: 'first-image',
      purpose: { status: 'skipped' },
    });
  });

  it('ignores an empty choice', () => {
    expect(onboardingReducer(started, { type: 'choose-purposes', purposes: [] })).toBe(started);
  });

  it('accepts unsure alone as a chosen answer', () => {
    expect(run([{ type: 'choose-purposes', purposes: ['unsure'] }], started)).toEqual({
      step: 'first-image',
      purpose: { status: 'selected', purposes: ['unsure'] },
    });
  });

  it('ignores unsure mixed with another purpose', () => {
    expect(
      onboardingReducer(started, { type: 'choose-purposes', purposes: ['food', 'unsure'] }),
    ).toBe(started);
  });

  it('ignores an answer before the intro is finished', () => {
    expect(onboardingReducer(initialProgress, { type: 'skip-purpose' })).toBe(initialProgress);
  });

  it('ignores the same answer given twice', () => {
    const chosen = run([{ type: 'choose-purposes', purposes: ['events'] }], started);

    expect(onboardingReducer(chosen, { type: 'choose-purposes', purposes: ['events'] })).toBe(
      chosen,
    );
    const skipped = run([{ type: 'skip-purpose' }], started);
    expect(onboardingReducer(skipped, { type: 'skip-purpose' })).toBe(skipped);
  });

  it('replaces the answer when the user comes back and answers differently', () => {
    const chosen = run([{ type: 'choose-purposes', purposes: ['events'] }], started);

    expect(run([{ type: 'skip-purpose' }], chosen)).toEqual({
      step: 'first-image',
      purpose: { status: 'skipped' },
    });
  });
});

describe('selectedPurposes', () => {
  it('pre-selects the saved answer when the user comes back', () => {
    expect(selectedPurposes({ status: 'selected', purposes: ['food', 'work'] })).toEqual([
      'food',
      'work',
    ]);
  });

  it('pre-selects nothing after a skip or before an answer', () => {
    expect(selectedPurposes({ status: 'skipped' })).toEqual([]);
    expect(selectedPurposes({ status: 'unanswered' })).toEqual([]);
  });
});
