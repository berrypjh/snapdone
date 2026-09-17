export const AUTH_ERROR_CODES = [
  'cancelled',
  'provider_unavailable',
  'network',
  'session_expired',
  'invalid_callback',
  'storage_unavailable',
] as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

export const AUTH_PROVIDERS = ['google'] as const;

export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

export type OnboardingStep = 'intro' | 'complete';

export type Session = {
  user: { id: string };
  onboardingStep: OnboardingStep;
  expiresAt: string;
};

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
  | { status: 'recoverable-error'; generation: number; error: AuthErrorCode };

export type AuthEvent =
  | { type: 'restored'; generation: number; session: Session | null }
  | { type: 'restore-failed'; generation: number; error: AuthErrorCode }
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

    case 'restore-failed':
      if (state.status !== 'restoring' || state.generation !== event.generation) return state;
      return { status: 'recoverable-error', generation: state.generation, error: event.error };

    case 'submit':
      return submit(state, event);

    case 'resolved':
      return resolve(state, event);

    case 'cancel':
      return state.status === 'submitting' ? state.previous : state;

    case 'dismiss':
      return idleFrom(state) ?? state;

    case 'session-expired':
      if (state.status !== 'authenticated' || state.generation !== event.generation) return state;
      return {
        status: 'recoverable-error',
        generation: state.generation,
        error: 'session_expired',
      };

    case 'logout':
      return { status: 'anonymous', generation: state.generation + 1 };
  }
};

export type AuthDestination = 'restoring' | 'sign-in' | 'onboarding' | 'home';

export const destinationFor = (state: AuthState): AuthDestination => {
  if (state.status === 'restoring') return 'restoring';
  if (state.status !== 'authenticated') return 'sign-in';
  return state.session.onboardingStep === 'complete' ? 'home' : 'onboarding';
};

export const toAuthErrorCode = (value: unknown): AuthErrorCode =>
  AUTH_ERROR_CODES.find((code) => code === value) ?? 'provider_unavailable';
