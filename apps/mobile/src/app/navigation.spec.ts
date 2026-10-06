import type { ProcessingResult } from '@snapdone/onboarding';
import { describe, expectTypeOf, it } from 'vitest';

import type { SelectedImage } from '../onboarding/capture';

import type { OnboardingStackParamList } from './navigation';

describe('OnboardingStackParamList', () => {
  it('opens the result with the processed photo and its result, nothing optional', () => {
    expectTypeOf<OnboardingStackParamList['OnboardingResult']>().toEqualTypeOf<{
      image: SelectedImage;
      result: ProcessingResult;
    }>();
  });
});
