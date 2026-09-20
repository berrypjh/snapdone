import {
  type AuthProvider,
  type LoginResponse,
  parseLoginResponse,
  parseProviders,
  parseSession,
  type Session,
  toAuthErrorCode,
} from '@snapdone/auth-contracts';

import { bearer, getApiBaseUrl, isRecord } from '../lib/api';

import type { AuthErrorCode } from './model';

export class AuthApiError extends Error {
  constructor(readonly code: AuthErrorCode) {
    super(code);
    this.name = 'AuthApiError';
  }
}

/** 오류를 사용자에게 보일 코드로. 인증 API 오류가 아니면 `provider_unavailable`이다. */
export const errorCodeOf = (error: unknown): AuthErrorCode =>
  error instanceof AuthApiError ? error.code : 'provider_unavailable';

export type OAuthStartRequest = {
  provider: AuthProvider;
  challenge: string;
  state: string;
  platform: 'mobile';
};

export type { LoginResponse };

export type AuthApi = {
  capabilities: () => Promise<AuthProvider[]>;
  session: (credential: string) => Promise<Session | null>;
  logout: (credential: string) => Promise<void>;
  oauthStart: (request: OAuthStartRequest) => Promise<string>;
  oauthCancel: (state: string) => Promise<void>;
  exchange: (request: { code: string; verifier: string; state: string }) => Promise<LoginResponse>;
  /** WebView 핸드오프 일회용 코드. Go가 세션을 받지 않으면(401) `null`이다. */
  handoffStart: (
    credential: string,
    request: { challenge: string; next: string },
  ) => Promise<string | null>;
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
  throw new AuthApiError(toAuthErrorCode(isRecord(body) ? body.error : undefined));
};

const postJson = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

export const authApi: AuthApi = {
  capabilities: async () => {
    return parseProviders(await (await request('/v1/auth/capabilities')).json());
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
    const login = parseLoginResponse(
      await (await postJson('/v1/auth/exchange', exchangeRequest)).json(),
    );
    if (!login) throw new AuthApiError('provider_unavailable');
    return login;
  },

  handoffStart: async (credential, handoffRequest) => {
    const response = await postJson('/v1/auth/handoff/start', handoffRequest, bearer(credential));
    if (response.status === 401) return null;

    const body: unknown = await response.json();
    if (!isRecord(body) || typeof body.code !== 'string' || body.code === '') {
      throw new AuthApiError('provider_unavailable');
    }
    return body.code;
  },
};
