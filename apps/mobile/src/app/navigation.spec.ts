import type { ImageType, JobDetail } from '@snapdone/processing';
import { describe, expectTypeOf, it } from 'vitest';

import type { SelectedImage } from '../onboarding/capture';

import type { OnboardingStackParamList, RootStackParamList } from './navigation';

describe('OnboardingStackParamList', () => {
  it('opens the result with the processed photo and the server job, nothing optional', () => {
    expectTypeOf<OnboardingStackParamList['OnboardingResult']>().toEqualTypeOf<{
      image: SelectedImage;
      job: JobDetail;
    }>();
  });
});

describe('RootStackParamList', () => {
  it('carries the photo between the photo screens and the server job to the result', () => {
    expectTypeOf<RootStackParamList['PhotoPreview']>().toEqualTypeOf<{ image: SelectedImage }>();
    expectTypeOf<RootStackParamList['PhotoProcessing']>().toEqualTypeOf<{
      image: SelectedImage;
      choice?: { sourceJobId: string; imageType?: ImageType; action?: string };
    }>();
    expectTypeOf<RootStackParamList['PhotoResult']>().toEqualTypeOf<{
      image: SelectedImage;
      job: JobDetail;
    }>();
  });
});
