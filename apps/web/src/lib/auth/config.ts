const isProduction = () => process.env.NODE_ENV === 'production';

/**
 * 이 web이 서비스되는 단 하나의 origin(`WEB_ORIGIN`). Go `AUTH_WEB_ORIGIN`과 같아야 한다.
 * mutation은 요청 `Origin` 헤더를 이 값과 비교한다. `X-Forwarded-*`는 읽지 않으므로
 * 신뢰할 proxy가 필요 없다.
 */
export const getWebOrigin = (): string => {
  const value = process.env.WEB_ORIGIN ?? '';
  const url = URL.parse(value);
  const secure = url?.protocol === 'https:' || (!isProduction() && url?.protocol === 'http:');

  if (!url || !secure || url.origin !== value) {
    throw new Error(
      'WEB_ORIGIN이 올바르지 않습니다. scheme://host[:port] 형식(production은 https)으로 apps/web/.env.local에 설정하세요.',
    );
  }
  return value;
};

export const isAllowedOrigin = (origin: string | null): boolean => origin === getWebOrigin();

export type LegalLinks = { terms: string; privacy: string };

const httpsUrl = (value: string | undefined) =>
  value && URL.parse(value)?.protocol === 'https:' ? value : null;

/** 약관 · 개인정보처리방침 링크. 둘 다 실제 https 문서일 때만 있다. */
export const getLegalLinks = (): LegalLinks | null => {
  const terms = httpsUrl(process.env.TERMS_URL);
  const privacy = httpsUrl(process.env.PRIVACY_URL);
  return terms && privacy ? { terms, privacy } : null;
};

/** production에서는 동의할 문서가 생기기 전까지 가입을 받지 않는다. */
export const isSignUpAllowed = (links: LegalLinks | null, production = isProduction()) =>
  links !== null || !production;
