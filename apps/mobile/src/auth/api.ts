import { getApiBaseUrl } from '../lib/api';

import {
  AUTH_PROVIDERS,
  type AuthErrorCode,
  type AuthProvider,
  type Session,
  toAuthErrorCode,
} from './model';

export class AuthApiError extends Error {
  constructor(readonly code: AuthErrorCode) {
    super(code);
    this.name = 'AuthApiError';
  }
}

export type OAuthStartRequest = {
  provider: AuthProvider;
  challenge: string;
  state: string;
  platform: 'mobile';
};

export type LoginResponse = { session: Session; credential: string };

export type AuthApi = {
  capabilities: () => Promise<AuthProvider[]>;
  session: (credential: string) => Promise<Session | null>;
  logout: (credential: string) => Promise<void>;
  oauthStart: (request: OAuthStartRequest) => Promise<string>;
  oauthCancel: (state: string) => Promise<void>;
  exchange: (request: { code: string; verifier: string; state: string }) => Promise<LoginResponse>;
};

const request = async (path: string, init?: RequestInit): Promise<Response> => {
  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, init);
  } catch {
    throw new AuthApiError('network');
  }
  if (response.ok || response.status === 401) return response;

  const body: unknown = await response.json().catch(() => null);
  throw new AuthApiError(toAuthErrorCode((body as { error?: unknown } | null)?.error));
};

const bearer = (credential: string) => ({ Authorization: `Bearer ${credential}` });

const postJson = (path: string, body: unknown) =>
  request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const parseSession = (value: unknown): Session | null => {
  if (!isRecord(value) || !isRecord(value.user)) return null;
  const { user, onboardingStep, expiresAt } = value;
  if (typeof user.id !== 'string' || typeof expiresAt !== 'string') return null;
  if (onboardingStep !== 'intro' && onboardingStep !== 'complete') return null;
  return { user: { id: user.id }, onboardingStep, expiresAt };
};

export const authApi: AuthApi = {
  capabilities: async () => {
    const body: unknown = await (await request('/v1/auth/capabilities')).json();
    const providers = isRecord(body) && Array.isArray(body.providers) ? body.providers : [];
    return AUTH_PROVIDERS.filter((provider) => providers.includes(provider));
  },

  session: async (credential) => {
    const response = await request('/v1/auth/session', { headers: bearer(credential) });
    if (response.status === 401) return null;

    const session = parseSession(await response.json());
    if (!session) throw new AuthApiError('provider_unavailable');
    return session;
  },

  logout: async (credential) => {
    await request('/v1/auth/logout', { method: 'POST', headers: bearer(credential) });
  },

  oauthStart: async (startRequest) => {
    const body: unknown = await (await postJson('/v1/auth/oauth/start', startRequest)).json();
    if (
      !isRecord(body) ||
      typeof body.authorizeUrl !== 'string' ||
      !body.authorizeUrl.startsWith('https://')
    ) {
      throw new AuthApiError('provider_unavailable');
    }
    return body.authorizeUrl;
  },

  oauthCancel: async (state) => {
    await postJson('/v1/auth/oauth/cancel', { state });
  },

  exchange: async (exchangeRequest) => {
    const response = await postJson('/v1/auth/exchange', exchangeRequest);
    const body: unknown = await response.json();
    const session = isRecord(body) ? parseSession(body.session) : null;
    if (
      !session ||
      !isRecord(body) ||
      typeof body.credential !== 'string' ||
      body.credential === ''
    ) {
      throw new AuthApiError('provider_unavailable');
    }
    return { session, credential: body.credential };
  },
};
