import { useSyncExternalStore } from 'react';

import {
  initialProgress,
  type OnboardingEvent,
  type OnboardingProgress,
  onboardingReducer,
} from './model';
import type { ProgressStore } from './progress';

export type OnboardingSnapshot =
  { status: 'loading' } | { status: 'ready'; progress: OnboardingProgress };

export type OnboardingControllerDeps = { store: ProgressStore };

/**
 * 로그인한 사용자 한 명의 온보딩 진행을 가진다. 진행은 서버에 있어 web에서 이어 할 수 있다.
 * 인증 상태는 모른다 — 온보딩 완료는 `AuthController`의 세션이 알려 준다.
 */
export const createOnboardingController = ({ store }: OnboardingControllerDeps) => {
  let snapshot: OnboardingSnapshot = { status: 'loading' };
  let saving: Promise<void> = Promise.resolve();
  const listeners = new Set<() => void>();

  const publish = (next: OnboardingSnapshot) => {
    snapshot = next;
    listeners.forEach((listener) => listener());
  };

  /** 저장된 진행을 읽는다. 읽지 못하면 처음부터 시작한다. */
  const load = async () => {
    const progress = await store.load().catch(() => null);
    if (snapshot.status === 'ready') return;
    publish({ status: 'ready', progress: progress ?? initialProgress });
  };

  /**
   * 진행을 바꾸고 순서대로 저장한다. 저장에 실패해도 지금 흐름은 이어진다 —
   * 다음 실행이 마지막으로 저장된 단계에서 시작할 뿐이다.
   */
  const dispatch = (event: OnboardingEvent) => {
    if (snapshot.status !== 'ready') return;
    const progress = onboardingReducer(snapshot.progress, event);
    if (progress === snapshot.progress) return;
    publish({ status: 'ready', progress });
    saving = saving.then(() => store.save(progress)).catch(() => undefined);
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    load,
    dispatch,
  };
};

export type OnboardingController = ReturnType<typeof createOnboardingController>;

export const useOnboardingSnapshot = (controller: OnboardingController): OnboardingSnapshot =>
  useSyncExternalStore(controller.subscribe, controller.getSnapshot);
