import type { Session } from '@snapdone/auth-contracts';
import type { CompletedProgress } from '@snapdone/onboarding';
import { describe, expect, it, vi } from 'vitest';

import { completeOnboarding } from './completion';

const completed: CompletedProgress = { step: 'complete', purposes: ['receipt'] };

const sessionAt = (onboardingStep: Session['onboardingStep']): Session => ({
  user: { id: 'user-1' },
  onboardingStep,
  expiresAt: '2026-10-01T00:00:00Z',
});

describe('completeOnboarding', () => {
  it('completes on the server, then takes the refreshed session', async () => {
    const order: string[] = [];
    const complete = vi.fn(async () => {
      order.push('complete');
      return completed;
    });
    const refreshSession = vi.fn(async () => {
      order.push('refresh');
      return sessionAt('complete');
    });

    await expect(completeOnboarding({ complete, refreshSession })).resolves.toBeUndefined();
    expect(order).toEqual(['complete', 'refresh']);
  });

  it('stops without refreshing when the session is gone', async () => {
    const refreshSession = vi.fn(async () => sessionAt('complete'));

    await completeOnboarding({ complete: async () => null, refreshSession });

    expect(refreshSession).not.toHaveBeenCalled();
  });

  it('fails when the server cannot be reached for completion', async () => {
    const refreshSession = vi.fn(async () => sessionAt('complete'));

    await expect(
      completeOnboarding({
        complete: () => Promise.reject(new TypeError('Network request failed')),
        refreshSession,
      }),
    ).rejects.toThrow();
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it('fails when the refresh does not arrive, and a retry completes again before refreshing', async () => {
    const complete = vi.fn(async () => completed);
    const refreshSession = vi
      .fn<() => Promise<Session | null>>()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(sessionAt('complete'));

    await expect(completeOnboarding({ complete, refreshSession })).rejects.toThrow();
    await expect(completeOnboarding({ complete, refreshSession })).resolves.toBeUndefined();
    expect(complete).toHaveBeenCalledTimes(2);
    expect(refreshSession).toHaveBeenCalledTimes(2);
  });

  it('fails when the refreshed session still says onboarding', async () => {
    await expect(
      completeOnboarding({
        complete: async () => completed,
        refreshSession: async () => sessionAt('first-image'),
      }),
    ).rejects.toThrow();
  });

  it('returns quietly when the session expires during the refresh', async () => {
    await expect(
      completeOnboarding({ complete: async () => completed, refreshSession: async () => null }),
    ).resolves.toBeUndefined();
  });
});
