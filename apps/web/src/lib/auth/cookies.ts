/** 시작한 로그인이 Google 왕복을 기다리는 시간. Go transaction TTL과 같다. */
export const PREAUTH_MAX_AGE_SECONDS = 10 * 60;

/** WebView 핸드오프 verifier가 앱의 코드 발급 · 교환을 기다리는 시간. */
export const HANDOFF_MAX_AGE_SECONDS = 2 * 60;

type CookieOptions = { httpOnly: true; secure: boolean; sameSite: 'lax'; path: '/' };

export type AuthCookies = {
  session: string;
  preauth: string;
  handoff: string;
  options: CookieOptions;
};

/**
 * production은 `__Host-` 이름을 쓴다. 브라우저는 Secure · Path=/ · Domain 없음일 때만 받는다.
 * 로컬 HTTP 개발에서는 모든 브라우저가 Secure cookie를 받지 않으므로 `-dev` 접미사 이름을 쓰고
 * 나머지 속성은 그대로 둔다.
 */
export const authCookies = (production = process.env.NODE_ENV === 'production'): AuthCookies => ({
  session: production ? '__Host-snapdone-session' : 'snapdone-session-dev',
  preauth: production ? '__Host-snapdone-preauth' : 'snapdone-preauth-dev',
  handoff: production ? '__Host-snapdone-handoff' : 'snapdone-handoff-dev',
  options: { httpOnly: true, secure: production, sameSite: 'lax', path: '/' },
});

/** `expiresAt`까지 남은 초(내림). 0 이하면 세션을 저장하면 안 된다. */
export const secondsUntil = (expiresAt: string, now = Date.now()): number =>
  Math.floor((Date.parse(expiresAt) - now) / 1000);

/** 로그인 시작부터 callback까지 브라우저가 들고 있는 값. */
export type Preauth = { state: string; verifier: string; returnTo: string };

const PROOF = /^[A-Za-z0-9_-]{43,128}$/;

/** 핸드오프 verifier cookie 값. 모양이 틀리면 `null`이다. */
export const decodeHandoffVerifier = (value: string | undefined): string | null =>
  value && PROOF.test(value) ? value : null;

export const encodePreauth = ({ state, verifier, returnTo }: Preauth) =>
  [state, verifier, encodeURIComponent(returnTo)].join('.');

export const decodePreauth = (value: string | undefined): Preauth | null => {
  const [state, verifier, returnTo, ...rest] = value?.split('.') ?? [];
  if (rest.length > 0 || !PROOF.test(state ?? '') || !PROOF.test(verifier ?? '') || !returnTo) {
    return null;
  }
  try {
    return { state, verifier, returnTo: decodeURIComponent(returnTo) };
  } catch {
    return null;
  }
};
