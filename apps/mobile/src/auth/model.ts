export const AUTH_ERROR_CODES = [
  'invalid_email',
  'invalid_code',
  'expired_code',
  'rate_limited',
  'cancelled',
  'provider_unavailable',
  'network',
  'session_expired',
  'account_conflict',
  'invalid_callback',
] as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

export type AuthProvider = 'email' | 'apple' | 'google';

export type OnboardingStep = 'intro' | 'complete';

export type Session = {
  user: { id: string };
  onboardingStep: OnboardingStep;
  expiresAt: string;
};

export type AuthOutcome =
  | { type: 'code-sent' }
  | { type: 'authenticated'; session: Session }
  | { type: 'failed'; error: AuthErrorCode };

type Idle =
  | { status: 'anonymous'; generation: number }
  | { status: 'email-code'; generation: number; email: string };

export type AuthState =
  | { status: 'restoring'; generation: number }
  | Idle
  | {
      status: 'submitting';
      generation: number;
      provider: AuthProvider;
      requestId: string;
      email?: string;
      previous: Idle;
    }
  | { status: 'authenticated'; generation: number; session: Session }
  | { status: 'recoverable-error'; generation: number; error: AuthErrorCode; email?: string };

export type AuthEvent =
  | { type: 'restored'; generation: number; session: Session | null }
  | { type: 'restore-failed'; generation: number; error: AuthErrorCode }
  | { type: 'submit'; provider: AuthProvider; requestId: string; email?: string }
  | { type: 'resolved'; generation: number; requestId: string; outcome: AuthOutcome }
  | { type: 'cancel' }
  | { type: 'dismiss' }
  | { type: 'session-expired'; generation: number }
  | { type: 'logout' };

export const initialAuthState: AuthState = { status: 'restoring', generation: 0 };

const idleFrom = (state: AuthState): Idle | null => {
  switch (state.status) {
    case 'anonymous':
    case 'email-code':
      return state;
    case 'recoverable-error':
      return state.email
        ? { status: 'email-code', generation: state.generation, email: state.email }
        : { status: 'anonymous', generation: state.generation };
    default:
      return null;
  }
};

const submit = (state: AuthState, event: Extract<AuthEvent, { type: 'submit' }>): AuthState => {
  const previous = idleFrom(state);
  if (!previous) return state;

  const email = previous.status === 'email-code' ? previous.email : event.email;
  if (event.provider === 'email' && !email) return state;

  return {
    status: 'submitting',
    generation: state.generation,
    provider: event.provider,
    requestId: event.requestId,
    email: event.provider === 'email' ? email : undefined,
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

  const { generation, email, previous } = state;
  const { outcome } = event;

  switch (outcome.type) {
    case 'code-sent':
      return email ? { status: 'email-code', generation, email } : state;
    case 'authenticated':
      return { status: 'authenticated', generation, session: outcome.session };
    case 'failed':
      if (outcome.error === 'cancelled') return previous;
      return {
        status: 'recoverable-error',
        generation,
        error: outcome.error,
        email: previous.status === 'email-code' ? previous.email : undefined,
      };
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
