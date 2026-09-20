import {
  isPurposeSelection,
  orderPurposes,
  type Purpose,
  type ResumeStep,
} from '@snapdone/onboarding';

export type PurposeAnswer =
  | { status: 'unanswered' }
  | { status: 'selected'; purposes: readonly Purpose[] }
  | { status: 'skipped' };

/**
 * 서버에 저장되는 진행(단계 · 목적). 사진 확인 · 처리 단계는 일부러 없다 —
 * 그 도중에 앱이 꺼지면 첫 사진 단계로 돌아간다.
 */
export type OnboardingProgress = { step: ResumeStep; purpose: PurposeAnswer };

export type OnboardingEvent =
  | { type: 'start' }
  | { type: 'choose-purposes'; purposes: readonly Purpose[] }
  | { type: 'skip-purpose' };

export const initialProgress: OnboardingProgress = {
  step: 'intro',
  purpose: { status: 'unanswered' },
};

/** 목적 선택 화면에 다시 들어왔을 때 미리 골라 둘 목적. 건너뛰었거나 아직 답하지 않았으면 없다. */
export const selectedPurposes = (answer: PurposeAnswer): readonly Purpose[] =>
  answer.status === 'selected' ? answer.purposes : [];

const sameAnswer = (a: PurposeAnswer, b: PurposeAnswer) =>
  a.status === b.status &&
  (a.status !== 'selected' || b.status !== 'selected' || a.purposes.join() === b.purposes.join());

const answer = (progress: OnboardingProgress, purpose: PurposeAnswer): OnboardingProgress => {
  if (progress.step === 'intro') return progress;
  if (progress.step === 'first-image' && sameAnswer(progress.purpose, purpose)) return progress;
  return { step: 'first-image', purpose };
};

/** 바뀐 것이 없으면 같은 객체를 돌려준다. 연속 탭으로 같은 사건이 두 번 와도 한 번과 같다. */
export const onboardingReducer = (
  progress: OnboardingProgress,
  event: OnboardingEvent,
): OnboardingProgress => {
  switch (event.type) {
    case 'start':
      return progress.step === 'intro' ? { ...progress, step: 'purpose' } : progress;

    // 빈 선택은 답이 아니다. 고르지 않고 넘어가는 것은 skip-purpose다.
    case 'choose-purposes': {
      const purposes = orderPurposes(event.purposes);
      if (!isPurposeSelection(purposes)) return progress;
      return answer(progress, { status: 'selected', purposes });
    }

    case 'skip-purpose':
      return answer(progress, { status: 'skipped' });
  }
};
