import {
  type AuthErrorCode,
  type AuthProvider,
  type LoginResponse,
  parseLoginResponse,
  parseProviders,
  parseSession,
  type Session,
  toAuthErrorCode,
} from '@snapdone/auth-contracts';

import { apiFetch, bearer, isRecord } from '../api';

export class AuthApiError extends Error {
  constructor(readonly code: AuthErrorCode) {
    super(code);
    this.name = 'AuthApiError';
  }
}

const request = async (path: string, init: RequestInit = {}): Promise<Response> => {
  let response: Response;
  try {
    response = await apiFetch(path, init);
  } catch {
    throw new AuthApiError('network');
  }
  if (response.ok || response.status === 401) return response;

  const body: unknown = await response.json().catch(() => null);
  throw new AuthApiError(toAuthErrorCode(isRecord(body) ? body.error : undefined));
};

const postJson = (path: string, body: unknown) =>
  request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const isHttpsUrl = (value: unknown): value is string =>
  typeof value === 'string' && URL.parse(value)?.protocol === 'https:';

/** 서버가 제공하는 로그인 수단 중 이 클라이언트가 아는 것만. */
export const fetchCapabilities = async (): Promise<AuthProvider[]> => {
  return parseProviders(await (await request('/v1/auth/capabilities')).json());
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

const parseLogin = async (response: Response): Promise<LoginResponse> => {
  if (response.status === 401) throw new AuthApiError('invalid_callback');

  const login = parseLoginResponse(await response.json());
  if (!login) throw new AuthApiError('provider_unavailable');
  return login;
};

/** 일회용 result code를 세션으로 바꾼다. code마다 최대 한 번만 성공한다. */
export const exchangeResultCode = async (proof: {
  code: string;
  verifier: string;
  state: string;
}): Promise<LoginResponse> => parseLogin(await postJson('/v1/auth/exchange', proof));

/** 앱이 받은 핸드오프 code를 이 브라우저의 verifier로 child web 세션으로 바꾼다. */
export const exchangeHandoffCode = async (proof: {
  code: string;
  verifier: string;
  next: string;
}): Promise<LoginResponse> => parseLogin(await postJson('/v1/auth/handoff/exchange', proof));
