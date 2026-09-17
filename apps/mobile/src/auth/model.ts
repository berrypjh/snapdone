import {
  AUTH_ERROR_CODES as SHARED_AUTH_ERROR_CODES,
  type AuthProvider,
  type Session,
} from '@snapdone/auth-contracts';

/**
 * 공용 오류 코드에 mobile 전용 `storage_unavailable`을 더한다. 기기 보안 저장소 실패에서만 생기고
 * 서버는 보내지 않으므로, 서버 값을 좁히는 공용 `toAuthErrorCode`가 받아들이지 않게 lib 밖에 둔다.
 */
export const AUTH_ERROR_CODES = [...SHARED_AUTH_ERROR_CODES, 'storage_unavailable'] as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

export type AuthOutcome =
  { type: 'authenticated'; session: Session } | { type: 'failed'; error: AuthErrorCode };

type Idle = { status: 'anonymous'; generation: number };

export type AuthState =
  | { status: 'restoring'; generation: number }
  | Idle
  | {
      status: 'submitting';
      generation: number;
      provider: AuthProvider;
      requestId: string;
      previous: Idle;
    }
  | { status: 'authenticated'; generation: number; session: Session }
  | { status: 'recoverable-error'; generation: number; error: AuthErrorCode }
  | { status: 'restore-failed'; generation: number; error: AuthErrorCode };

export type AuthEvent =
  | { type: 'restored'; generation: number; session: Session | null }
  | { type: 'restore-failed'; generation: number; error: AuthErrorCode }
  | { type: 'retry-restore' }
  | { type: 'submit'; provider: AuthProvider; requestId: string }
  | { type: 'resolved'; generation: number; requestId: string; outcome: AuthOutcome }
  | { type: 'cancel' }
  | { type: 'dismiss' }
  | { type: 'session-expired'; generation: number }
  | { type: 'logout' };

export const initialAuthState: AuthState = { status: 'restoring', generation: 0 };

const idleFrom = (state: AuthState): Idle | null => {
  switch (state.status) {
    case 'anonymous':
      return state;
    case 'recoverable-error':
      return { status: 'anonymous', generation: state.generation };
    default:
      return null;
  }
};

const submit = (state: AuthState, event: Extract<AuthEvent, { type: 'submit' }>): AuthState => {
  const previous = idleFrom(state);
  if (!previous) return state;

  return {
    status: 'submitting',
    generation: state.generation,
    provider: event.provider,
    requestId: event.requestId,
    previous,
  };
};

const resolve = (state: AuthState, event: Extract<AuthEvent, { type: 'resolved' }>): AuthState => {
  if (
    state.status !== 'submitting' ||
    state.requestId !== event.requestId ||
    state.generation !== event.generation
  ) {
    return state;
  }

  const { generation, previous } = state;
  const { outcome } = event;

  switch (outcome.type) {
    case 'authenticated':
      return { status: 'authenticated', generation, session: outcome.session };
    case 'failed':
      if (outcome.error === 'cancelled') return previous;
      return { status: 'recoverable-error', generation, error: outcome.error };
  }
};

export const authReducer = (state: AuthState, event: AuthEvent): AuthState => {
  switch (event.type) {
    case 'restored':
      if (state.status !== 'restoring' || state.generation !== event.generation) return state;
      return event.session
        ? { status: 'authenticated', generation: state.generation, session: event.session }
        : { status: 'anonymous', generation: state.generation };

    // 서버 · 저장소에 닿지 못했을 뿐 credential은 남아 있다. 로그인 화면이 아니라 재시도로 둔다.
    case 'restore-failed':
      if (state.status !== 'restoring' || state.generation !== event.generation) return state;
      return { status: 'restore-failed', generation: state.generation, error: event.error };

    case 'retry-restore':
      return state.status === 'restore-failed'
        ? { status: 'restoring', generation: state.generation }
        : state;

    case 'submit':
      return submit(state, event);

    case 'resolved':
      return resolve(state, event);

    case 'cancel':
      return state.status === 'submitting' ? state.previous : state;

    case 'dismiss':
      return idleFrom(state) ?? state;

    // generation을 올려 만료 전에 시작한 재검증 · 핸드오프 결과가 다음 로그인에 닿지 않게 한다.
    case 'session-expired':
      if (state.status !== 'authenticated' || state.generation !== event.generation) return state;
      return {
        status: 'recoverable-error',
        generation: state.generation + 1,
        error: 'session_expired',
      };

    case 'logout':
      return { status: 'anonymous', generation: state.generation + 1 };
  }
};

export type AuthDestination = 'restoring' | 'restore-failed' | 'sign-in' | 'onboarding' | 'home';

/** `complete`만 home이다. 가입 시각 · provider · 기기 flag로 신규 여부를 정하지 않는다. */
export const destinationFor = (state: AuthState): AuthDestination => {
  if (state.status === 'restoring') return 'restoring';
  if (state.status === 'restore-failed') return 'restore-failed';
  if (state.status !== 'authenticated') return 'sign-in';
  return state.session.onboardingStep === 'complete' ? 'home' : 'onboarding';
};
