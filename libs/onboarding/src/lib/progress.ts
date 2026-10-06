import { type OnboardingStep, toOnboardingStep } from '@snapdone/auth-contracts';

import { isPurpose, isPurposeSelection, orderPurposes, type Purpose } from './purposes';
import { isRecord } from './record';

/** 온보딩 도중 저장할 수 있는 단계. `complete`는 온보딩을 끝내는 단계가 만든다. */
export type ResumeStep = Exclude<OnboardingStep, 'complete'>;

/**
 * 서버에 저장된 온보딩 진행(`GET` · `PUT /v1/onboarding`). mobile과 web이 같은 값을 읽고 쓴다.
 * `purposes`는 first-image부터 있다 — `null`은 아직 답하지 않음, 빈 목록은 건너뜀이다.
 */
export type SavedProgress = { step: OnboardingStep; purposes: readonly Purpose[] | null };

/** 온보딩 완료(`POST /v1/onboarding/complete`) 뒤의 진행. 목적은 first-image의 값 그대로다. */
export type CompletedProgress = SavedProgress & { step: 'complete' };

/** 저장 요청 본문. */
export type ProgressUpdate = { step: ResumeStep; purposes: readonly Purpose[] | null };

const parsePurposes = (value: unknown): readonly Purpose[] | null | undefined => {
  if (value === null) return null;
  if (!Array.isArray(value) || !value.every(isPurpose)) return undefined;
  const known = orderPurposes(value);
  if (known.length !== value.length) return undefined;
  return known.length === 0 || isPurposeSelection(known) ? known : undefined;
};

/** 응답 본문에서 진행만 꺼낸다. 값 · 단계와 목적의 짝이 틀리면 `null`이다. */
export const parseSavedProgress = (value: unknown): SavedProgress | null => {
  if (!isRecord(value)) return null;
  const step = toOnboardingStep(value.step);
  const purposes = parsePurposes(value.purposes);
  if (!step || purposes === undefined) return null;
  if ((step === 'intro' || step === 'purpose') && purposes !== null) return null;
  if (step === 'first-image' && purposes === null) return null;
  return { step, purposes };
};

/** 완료 응답 본문에서 진행만 꺼낸다. 진행 응답과 같은 모양이고, `complete`가 아니면 `null`이다. */
export const parseCompletedProgress = (value: unknown): CompletedProgress | null => {
  const progress = parseSavedProgress(value);
  return progress?.step === 'complete' ? { ...progress, step: 'complete' } : null;
};
