import type { Session } from '@snapdone/auth-contracts';
import { describe, expect, it, vi } from 'vitest';

import { AuthApiError } from './api';
import { createGoogleSignIn, finishGoogleSignIn, type GoogleSignInDeps } from './google';
import type { ProofCrypto } from './proof';
import type { AuthStorage, PendingProof } from './storage';

const REDIRECT = 'mobile://auth/callback';
const NOW = 1_800_000_000_000;

const session: Session = {
  user: { id: 'u1' },
  onboardingStep: 'intro',
  expiresAt: '2026-10-01T00:00:00Z',
};

const counter = { value: 0 };
const fakeCrypto: ProofCrypto = {
  randomBytes: (length) => new Uint8Array(length).fill((counter.value += 1)),
  sha256: async (data) => new Uint8Array(32).fill(data.length),
};

const memoryStorage = () => {
  let proof: PendingProof | null = null;
  const storage: AuthStorage = {
    readCredential: async () => ({ status: 'empty' }),
    saveCredential: async () => undefined,
    deleteCredential: async () => undefined,
    saveProof: vi.fn(async (next: PendingProof) => {
      proof = next;
    }),
    takeProof: vi.fn(async () => {
      const taken = proof;
      proof = null;
      return taken;
    }),
  };
  return { storage, current: () => proof };
};

const setup = (
  browserResult: (
    authorizeUrl: string,
    state: string,
  ) => { type: 'success'; url: string } | { type: 'cancel' },
) => {
  const { storage, current } = memoryStorage();
  const api = {
    oauthStart: vi.fn(async () => 'https://accounts.google.com/o/oauth2/v2/auth?state=server'),
    oauthCancel: vi.fn(async () => undefined),
    exchange: vi.fn(async () => ({ session, credential: 'opaque' })),
  };
  const deps: GoogleSignInDeps = {
    api,
    storage,
    crypto: fakeCrypto,
    browser: {
      openAuthSession: vi.fn(async (url: string) => browserResult(url, current()?.state ?? '')),
    },
    redirectUri: REDIRECT,
    now: () => NOW,
  };
  return { deps, api, storage, current };
};

describe('createGoogleSignIn', () => {
  it('sends only the challenge and state, opens the system session, and exchanges with the verifier', async () => {
    const { deps, api, current } = setup((_, state) => ({
      type: 'success',
      url: `${REDIRECT}?code=result&state=${state}`,
    }));

    const result = await createGoogleSignIn(deps)();

    expect(result).toEqual({ type: 'authenticated', session, credential: 'opaque' });
    const [startRequest] = api.oauthStart.mock.calls[0] as unknown as [Record<string, string>];
    expect(Object.keys(startRequest).sort()).toEqual([
      'challenge',
      'platform',
      'provider',
      'state',
    ]);
    expect(startRequest).toMatchObject({ provider: 'google', platform: 'mobile' });
    expect(deps.browser.openAuthSession).toHaveBeenCalledWith(
      'https://accounts.google.com/o/oauth2/v2/auth?state=server',
      REDIRECT,
    );
    const [exchangeRequest] = api.exchange.mock.calls[0] as unknown as [Record<string, string>];
    expect(exchangeRequest.code).toBe('result');
    expect(exchangeRequest.state).toBe(startRequest.state);
    expect(exchangeRequest.verifier).not.toBe(startRequest.challenge);
    expect(current()).toBeNull();
  });

  it('treats a closed browser as cancel, discards the proof, and asks the server to drop the start', async () => {
    const { deps, api, current } = setup(() => ({ type: 'cancel' }));

    await expect(createGoogleSignIn(deps)()).resolves.toEqual({
      type: 'failed',
      error: 'cancelled',
    });

    expect(current()).toBeNull();
    expect(api.oauthCancel).toHaveBeenCalledWith(
      (api.oauthStart.mock.calls[0] as unknown as [{ state: string }])[0].state,
    );
    expect(api.exchange).not.toHaveBeenCalled();
  });

  it('returns the server error carried back to the app', async () => {
    const { deps, api } = setup((_, state) => ({
      type: 'success',
      url: `${REDIRECT}?error=cancelled&state=${state}`,
    }));

    await expect(createGoogleSignIn(deps)()).resolves.toEqual({
      type: 'failed',
      error: 'cancelled',
    });
    expect(api.exchange).not.toHaveBeenCalled();
  });

  it('rejects a return whose state does not match the pending proof', async () => {
    const { deps, api } = setup(() => ({
      type: 'success',
      url: `${REDIRECT}?code=result&state=attacker`,
    }));

    await expect(createGoogleSignIn(deps)()).resolves.toEqual({
      type: 'failed',
      error: 'invalid_callback',
    });
    expect(api.exchange).not.toHaveBeenCalled();
  });

  it('rejects a return to another URI', async () => {
    const { deps, api } = setup((_, state) => ({
      type: 'success',
      url: `evil://auth/callback?code=c&state=${state}`,
    }));

    await expect(createGoogleSignIn(deps)()).resolves.toEqual({
      type: 'failed',
      error: 'invalid_callback',
    });
    expect(api.exchange).not.toHaveBeenCalled();
  });

  it('does not open the browser when the proof cannot be stored', async () => {
    const { deps } = setup(() => ({ type: 'cancel' }));
    deps.storage.saveProof = vi.fn(() => Promise.reject(new Error('keychain')));

    await expect(createGoogleSignIn(deps)()).resolves.toEqual({
      type: 'failed',
      error: 'storage_unavailable',
    });
    expect(deps.browser.openAuthSession).not.toHaveBeenCalled();
  });

  it('clears the proof when the server refuses to start', async () => {
    const { deps, api, current } = setup(() => ({ type: 'cancel' }));
    api.oauthStart.mockRejectedValueOnce(new AuthApiError('network'));

    await expect(createGoogleSignIn(deps)()).resolves.toEqual({ type: 'failed', error: 'network' });
    expect(current()).toBeNull();
    expect(deps.browser.openAuthSession).not.toHaveBeenCalled();
  });

  it('passes an exchange failure through as its code', async () => {
    const { deps, api } = setup((_, state) => ({
      type: 'success',
      url: `${REDIRECT}?code=result&state=${state}`,
    }));
    api.exchange.mockRejectedValueOnce(new AuthApiError('invalid_callback'));

    await expect(createGoogleSignIn(deps)()).resolves.toEqual({
      type: 'failed',
      error: 'invalid_callback',
    });
  });
});

describe('finishGoogleSignIn (cold start)', () => {
  it('ignores a callback when no sign-in is pending', async () => {
    const { deps, api } = setup(() => ({ type: 'cancel' }));

    await expect(finishGoogleSignIn(deps, `${REDIRECT}?code=c&state=s`)).resolves.toBeNull();
    expect(api.exchange).not.toHaveBeenCalled();
  });

  it('ignores a callback that arrives after the user cancelled', async () => {
    const { deps, api } = setup(() => ({ type: 'cancel' }));
    await createGoogleSignIn(deps)();
    const { state } = (api.oauthStart.mock.calls[0] as unknown as [{ state: string }])[0];

    await expect(
      finishGoogleSignIn(deps, `${REDIRECT}?code=late&state=${state}`),
    ).resolves.toBeNull();
    expect(api.exchange).not.toHaveBeenCalled();
  });

  it('ignores deep links that are not the auth callback', async () => {
    const { deps, storage } = setup(() => ({ type: 'cancel' }));

    await expect(finishGoogleSignIn(deps, 'mobile://history')).resolves.toBeNull();
    expect(storage.takeProof).not.toHaveBeenCalled();
  });

  it('finishes a pending sign-in from the launch URL', async () => {
    const { deps, storage, api } = setup(() => ({ type: 'cancel' }));
    await storage.saveProof({
      verifier: 'v'.repeat(43),
      challenge: 'c'.repeat(43),
      state: 's'.repeat(43),
      provider: 'google',
      createdAt: NOW,
    });

    await expect(
      finishGoogleSignIn(deps, `${REDIRECT}?code=c&state=${'s'.repeat(43)}`),
    ).resolves.toEqual({
      type: 'authenticated',
      session,
      credential: 'opaque',
    });
    expect(api.exchange).toHaveBeenCalledWith({
      code: 'c',
      verifier: 'v'.repeat(43),
      state: 's'.repeat(43),
    });
  });
});
