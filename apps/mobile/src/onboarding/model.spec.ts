import { describe, expect, it } from 'vitest';

import { initialProgress, onboardingReducer } from './model';

describe('initial progress', () => {
  it('starts at the intro', () => {
    expect(initialProgress).toEqual({ step: 'intro' });
  });
});

describe('start', () => {
  it('moves from the intro to the first image', () => {
    expect(onboardingReducer(initialProgress, { type: 'start' })).toEqual({ step: 'first-image' });
  });

  it('ignores a repeated start', () => {
    const started = onboardingReducer(initialProgress, { type: 'start' });

    expect(onboardingReducer(started, { type: 'start' })).toBe(started);
  });
});
