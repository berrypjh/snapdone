import type { ProcessingResult } from '@snapdone/onboarding';

import type { SelectedImage } from '../onboarding/capture';

export type RootStackParamList = {
  Restoring: undefined;
  RestoreFailed: undefined;
  Auth: undefined;
  Onboarding: undefined;
  Home: undefined;
  WebContent: { path: string; title: string };
};

/** 서버 온보딩이 끝나기 전의 화면들. 앞으로 가는 순서대로 적는다. */
export type OnboardingStackParamList = {
  OnboardingIntro: undefined;
  OnboardingPurpose: undefined;
  OnboardingFirstImage: undefined;
  /** 고른 사진은 화면 사이에서만 오간다. 저장하지 않는다. */
  OnboardingPreview: { image: SelectedImage };
  /** 첫 처리. 사진을 서버에 보내고 끝날 때까지 기다린다. */
  OnboardingProcessing: { image: SelectedImage };
  /** 첫 결과. 처리가 끝난 뒤에만 오고, 처리한 사진을 함께 보인다. 사진은 여기서도 저장하지 않는다. */
  OnboardingResult: { image: SelectedImage; result: ProcessingResult };
};
