import type { JobDetail } from '@snapdone/processing';

import type { SelectedImage } from '../onboarding/capture';
import type { Reprocess } from '../processing/jobApi';

export type RootStackParamList = {
  Restoring: undefined;
  RestoreFailed: undefined;
  Auth: undefined;
  Onboarding: undefined;
  Home: undefined;
  WebContent: { path: string; title: string };
  /** 홈의 사진 추가. 사진에서 선택하거나 카메라로 촬영한다. */
  PhotoCapture: undefined;
  /** 고른 사진은 화면 사이에서만 오간다. 저장하지 않는다. */
  PhotoPreview: { image: SelectedImage };
  /** 사진 처리. `choice`가 있으면 유형을 정하지 못한 작업을 고른 유형으로 이어서 처리한다. */
  PhotoProcessing: { image: SelectedImage; choice?: Reprocess };
  /** 현재 작업의 결과. 처리한 사진과 서버가 돌려준 작업을 함께 보인다. */
  PhotoResult: { image: SelectedImage; job: JobDetail };
};

/** 서버 온보딩이 끝나기 전의 화면들. 앞으로 가는 순서대로 적는다. */
export type OnboardingStackParamList = {
  OnboardingIntro: undefined;
  OnboardingFirstImage: undefined;
  /** 고른 사진은 화면 사이에서만 오간다. 저장하지 않는다. */
  OnboardingPreview: { image: SelectedImage };
  /** 첫 처리. 사진을 서버에 보내고 끝날 때까지 기다린다. `choice`가 있으면 고른 유형으로 이어서 처리한다. */
  OnboardingProcessing: { image: SelectedImage; choice?: Reprocess };
  /** 첫 결과. 처리가 끝난 뒤에만 오고, 처리한 사진과 서버 작업을 함께 보인다. 사진은 여기서도 저장하지 않는다. */
  OnboardingResult: { image: SelectedImage; job: JobDetail };
};
