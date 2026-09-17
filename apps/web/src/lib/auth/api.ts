import {
  AUTH_PROVIDERS,
  type AuthErrorCode,
  type AuthProvider,
  parseSession,
  type Session,
  toAuthErrorCode,
} from '@snapdone/auth-contracts';

import { getApiBaseUrl } from '../api';

export class AuthApiError extends Error {
  constructor(readonly code: AuthErrorCode) {
    super(code);
    this.name = 'AuthApiError';
  }
}

export type LoginResult = { session: Session; credential: string };

const request = async (path: string, init: RequestInit = {}): Promise<Response> => {
  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, { ...init, cache: 'no-store' });
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

const isHttpsUrl = (value: unknown): value is string =>
  typeof value === 'string' && URL.parse(value)?.protocol === 'https:';

/** 서버가 제공하는 로그인 수단 중 이 클라이언트가 아는 것만. */
export const fetchCapabilities = async (): Promise<AuthProvider[]> => {
  const body: unknown = await (await request('/v1/auth/capabilities')).json();
  const providers = isRecord(body) && Array.isArray(body.providers) ? body.providers : [];
  return AUTH_PROVIDERS.filter((provider) => providers.includes(provider));
};

/** credential의 세션. 서버가 더는 받지 않으면 `null`이다. */
export const fetchSession = async (credential: string): Promise<Session | null> => {
  const response = await request('/v1/auth/session', { headers: bearer(credential) });
  if (response.status === 401) return null;

  const session = parseSession(await response.json());
  if (!session) throw new AuthApiError('provider_unavailable');
  return session;
};

export const revokeSession = async (credential: string): Promise<void> => {
  await request('/v1/auth/logout', { method: 'POST', headers: bearer(credential) });
};

/** web Google 로그인을 시작하고 브라우저를 보낼 https 동의 화면 주소를 돌려준다. */
export const startGoogleOAuth = async (proof: {
  challenge: string;
  state: string;
}): Promise<string> => {
  const response = await postJson('/v1/auth/oauth/start', {
    provider: 'google',
    platform: 'web',
    ...proof,
  });
  const body: unknown = await response.json();
  if (!isRecord(body) || !isHttpsUrl(body.authorizeUrl)) {
    throw new AuthApiError('provider_unavailable');
  }
  return body.authorizeUrl;
};

const parseLogin = async (response: Response): Promise<LoginResult> => {
  if (response.status === 401) throw new AuthApiError('invalid_callback');

  const body: unknown = await response.json();
  const session = isRecord(body) ? parseSession(body.session) : null;
  if (!session || !isRecord(body) || typeof body.credential !== 'string' || !body.credential) {
    throw new AuthApiError('provider_unavailable');
  }
  return { session, credential: body.credential };
};

/** 일회용 result code를 세션으로 바꾼다. code마다 최대 한 번만 성공한다. */
export const exchangeResultCode = async (proof: {
  code: string;
  verifier: string;
  state: string;
}): Promise<LoginResult> => parseLogin(await postJson('/v1/auth/exchange', proof));

/** 앱이 받은 핸드오프 code를 이 브라우저의 verifier로 child web 세션으로 바꾼다. */
export const exchangeHandoffCode = async (proof: {
  code: string;
  verifier: string;
  next: string;
}): Promise<LoginResult> => parseLogin(await postJson('/v1/auth/handoff/exchange', proof));
