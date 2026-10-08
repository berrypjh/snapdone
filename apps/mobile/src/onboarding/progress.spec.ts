import { describe, expect, it } from 'vitest';

import { fromSaved } from './progress';

describe('fromSaved', () => {
  it('resumes the saved step', () => {
    expect(fromSaved({ step: 'intro' })).toEqual({ step: 'intro' });
    expect(fromSaved({ step: 'first-image' })).toEqual({ step: 'first-image' });
  });

  it('has nothing to resume once onboarding is complete', () => {
    expect(fromSaved({ step: 'complete' })).toBeNull();
  });
});
