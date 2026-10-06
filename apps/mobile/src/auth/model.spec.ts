import type { Session } from '@snapdone/auth-contracts';
import { describe, expect, it } from 'vitest';

import {
  type AuthEvent,
  authReducer,
  type AuthState,
  destinationFor,
  initialAuthState,
} from './model';

const session = (onboardingStep: Session['onboardingStep']): Session => ({
  user: { id: 'user-1' },
  onboardingStep,
  expiresAt: '2026-10-01T00:00:00Z',
});

const run = (events: AuthEvent[], from: AuthState = initialAuthState) =>
  events.reduce(authReducer, from);

const anonymous: AuthState = { status: 'anonymous', generation: 0 };

const submitGoogle = (requestId: string): AuthEvent => ({
  type: 'submit',
  provider: 'google',
  requestId,
});

describe('restoring', () => {
  it('becomes anonymous when nothing is stored', () => {
    expect(run([{ type: 'restored', generation: 0, session: null }])).toEqual(anonymous);
  });

  it('becomes authenticated with a stored session', () => {
    const state = run([{ type: 'restored', generation: 0, session: session('complete') }]);

    expect(state.status).toBe('authenticated');
  });

  it('keeps a failed restore retryable instead of showing sign-in', () => {
    const failed = run([{ type: 'restore-failed', generation: 0, error: 'network' }]);

    expect(failed).toEqual({ status: 'restore-failed', generation: 0, error: 'network' });
    expect(destinationFor(failed)).toBe('restore-failed');
    expect(authReducer(failed, { type: 'dismiss' })).toBe(failed);
    expect(authReducer(failed, { type: 'submit', provider: 'google', requestId: 'r1' })).toBe(
      failed,
    );
    expect(authReducer(failed, { type: 'retry-restore' })).toEqual(initialAuthState);
  });

  it('ignores retry-restore outside a failed restore', () => {
    expect(authReducer(anonymous, { type: 'retry-restore' })).toBe(anonymous);
  });

  it('ignores a restore result that arrives after logout', () => {
    const state = run([
      { type: 'logout' },
      { type: 'restored', generation: 0, session: session('complete') },
    ]);

    expect(state).toEqual({ status: 'anonymous', generation: 1 });
  });
});

describe('stale and duplicate responses', () => {
  it('ignores a second submit while one is pending', () => {
    const pending = authReducer(anonymous, submitGoogle('r1'));

    expect(authReducer(pending, submitGoogle('r2'))).toBe(pending);
  });

  it('ignores a response for another request', () => {
    const pending = authReducer(anonymous, submitGoogle('r1'));
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
        { type: 'submit', provider: 'google', requestId: 'r1' },
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
        { type: 'submit', provider: 'google', requestId: 'r1' },
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
      generation: 2,
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
    [{ status: 'restore-failed', generation: 0, error: 'network' }, 'restore-failed'],
    [run([submitGoogle('r1')], anonymous), 'sign-in'],
  ])('maps %j to %s', (state, destination) => {
    expect(destinationFor(state)).toBe(destination);
  });
});

describe('session-refreshed', () => {
  const firstImage: AuthState = {
    status: 'authenticated',
    generation: 1,
    session: session('first-image'),
  };

  it('takes the server session for the same sign-in, which sends a finished user home', () => {
    const state = authReducer(firstImage, {
      type: 'session-refreshed',
      generation: 1,
      session: session('complete'),
    });

    expect(state).toEqual({ status: 'authenticated', generation: 1, session: session('complete') });
    expect(destinationFor(firstImage)).toBe('onboarding');
    expect(destinationFor(state)).toBe('home');
  });

  it('ignores a refresh from another sign-in', () => {
    expect(
      authReducer(firstImage, {
        type: 'session-refreshed',
        generation: 0,
        session: session('complete'),
      }),
    ).toBe(firstImage);
  });

  it.each<AuthState>([anonymous, { status: 'recoverable-error', generation: 1, error: 'network' }])(
    'does not sign anyone in from %j',
    (state) => {
      expect(
        authReducer(state, {
          type: 'session-refreshed',
          generation: state.generation,
          session: session('complete'),
        }),
      ).toBe(state);
    },
  );
});
