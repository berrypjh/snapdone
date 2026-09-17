import { describe, expect, it } from 'vitest';

import {
  type AuthEvent,
  authReducer,
  type AuthState,
  destinationFor,
  initialAuthState,
  type Session,
  toAuthErrorCode,
} from './model';

const session = (onboardingStep: Session['onboardingStep']): Session => ({
  user: { id: 'user-1' },
  onboardingStep,
  expiresAt: '2026-10-01T00:00:00Z',
});

const run = (events: AuthEvent[], from: AuthState = initialAuthState) =>
  events.reduce(authReducer, from);

const anonymous: AuthState = { status: 'anonymous', generation: 0 };

const submitEmail = (requestId: string): AuthEvent => ({
  type: 'submit',
  provider: 'email',
  requestId,
  email: 'user@example.com',
});

describe('restoring', () => {
  it('becomes anonymous when nothing is stored', () => {
    expect(run([{ type: 'restored', generation: 0, session: null }])).toEqual(anonymous);
  });

  it('becomes authenticated with a stored session', () => {
    const state = run([{ type: 'restored', generation: 0, session: session('complete') }]);

    expect(state.status).toBe('authenticated');
  });

  it('shows a recoverable error when restore fails and returns to sign-in on dismiss', () => {
    const failed = run([{ type: 'restore-failed', generation: 0, error: 'network' }]);

    expect(failed).toEqual({ status: 'recoverable-error', generation: 0, error: 'network' });
    expect(authReducer(failed, { type: 'dismiss' })).toEqual(anonymous);
  });

  it('ignores a restore result that arrives after logout', () => {
    const state = run([
      { type: 'logout' },
      { type: 'restored', generation: 0, session: session('complete') },
    ]);

    expect(state).toEqual({ status: 'anonymous', generation: 1 });
  });
});

describe('email sign-in', () => {
  it('moves from code sent to authenticated', () => {
    const state = run(
      [
        submitEmail('r1'),
        { type: 'resolved', generation: 0, requestId: 'r1', outcome: { type: 'code-sent' } },
        { type: 'submit', provider: 'email', requestId: 'r2' },
        {
          type: 'resolved',
          generation: 0,
          requestId: 'r2',
          outcome: { type: 'authenticated', session: session('intro') },
        },
      ],
      anonymous,
    );

    expect(state).toEqual({ status: 'authenticated', generation: 0, session: session('intro') });
  });

  it('does not start without an email', () => {
    expect(authReducer(anonymous, { type: 'submit', provider: 'email', requestId: 'r1' })).toBe(
      anonymous,
    );
  });

  it('keeps the email after a wrong code so the user can retry', () => {
    const codeStep: AuthState = { status: 'email-code', generation: 0, email: 'user@example.com' };
    const state = run(
      [
        { type: 'submit', provider: 'email', requestId: 'r2' },
        {
          type: 'resolved',
          generation: 0,
          requestId: 'r2',
          outcome: { type: 'failed', error: 'invalid_code' },
        },
        { type: 'dismiss' },
      ],
      codeStep,
    );

    expect(state).toEqual(codeStep);
  });
});

describe('stale and duplicate responses', () => {
  it('ignores a second submit while one is pending', () => {
    const pending = authReducer(anonymous, submitEmail('r1'));

    expect(authReducer(pending, submitEmail('r2'))).toBe(pending);
  });

  it('ignores a response for another request', () => {
    const pending = authReducer(anonymous, submitEmail('r1'));
    const next = authReducer(pending, {
      type: 'resolved',
      generation: 0,
      requestId: 'r0',
      outcome: { type: 'authenticated', session: session('complete') },
    });

    expect(next).toBe(pending);
  });

  it('ignores a late success after cancel', () => {
    const state = run(
      [
        { type: 'submit', provider: 'apple', requestId: 'r1' },
        { type: 'cancel' },
        {
          type: 'resolved',
          generation: 0,
          requestId: 'r1',
          outcome: { type: 'authenticated', session: session('complete') },
        },
      ],
      anonymous,
    );

    expect(state).toEqual(anonymous);
  });

  it('ignores a late success after logout even if the request id is reused', () => {
    const state = run(
      [
        { type: 'submit', provider: 'google', requestId: 'r1' },
        { type: 'logout' },
        { type: 'submit', provider: 'google', requestId: 'r1' },
        {
          type: 'resolved',
          generation: 0,
          requestId: 'r1',
          outcome: { type: 'authenticated', session: session('complete') },
        },
      ],
      anonymous,
    );

    expect(state.status).toBe('submitting');
    expect(state.generation).toBe(1);
  });

  it('returns to the previous step when the provider reports cancelled', () => {
    const state = run(
      [
        { type: 'submit', provider: 'apple', requestId: 'r1' },
        {
          type: 'resolved',
          generation: 0,
          requestId: 'r1',
          outcome: { type: 'failed', error: 'cancelled' },
        },
      ],
      anonymous,
    );

    expect(state).toEqual(anonymous);
  });

  it('ignores session expiry from before logout', () => {
    const signedIn: AuthState = {
      status: 'authenticated',
      generation: 1,
      session: session('complete'),
    };

    expect(authReducer(signedIn, { type: 'session-expired', generation: 0 })).toBe(signedIn);
    expect(authReducer(signedIn, { type: 'session-expired', generation: 1 })).toEqual({
      status: 'recoverable-error',
      generation: 1,
      error: 'session_expired',
    });
  });
});

describe('destinationFor', () => {
  it('sends a new profile to onboarding', () => {
    expect(
      destinationFor({ status: 'authenticated', generation: 0, session: session('intro') }),
    ).toBe('onboarding');
  });

  it('sends only completed users home', () => {
    expect(
      destinationFor({ status: 'authenticated', generation: 0, session: session('complete') }),
    ).toBe('home');
  });

  it.each<[AuthState, string]>([
    [initialAuthState, 'restoring'],
    [anonymous, 'sign-in'],
    [{ status: 'recoverable-error', generation: 0, error: 'network' }, 'sign-in'],
  ])('maps %j to %s', (state, destination) => {
    expect(destinationFor(state)).toBe(destination);
  });
});

describe('toAuthErrorCode', () => {
  it('keeps known codes and hides anything else', () => {
    expect(toAuthErrorCode('rate_limited')).toBe('rate_limited');
    expect(toAuthErrorCode('AuthApiError: User already registered')).toBe('provider_unavailable');
  });
});
