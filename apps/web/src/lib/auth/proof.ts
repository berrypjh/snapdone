import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** 로그인 시도 한 번의 PKCE verifier · CSRF state와 Go에 보낼 S256 challenge. */
export type LoginProof = { verifier: string; state: string; challenge: string };

const randomToken = () => randomBytes(32).toString('base64url');

export const challengeS256 = (verifier: string) =>
  createHash('sha256').update(verifier).digest('base64url');

export const createLoginProof = (): LoginProof => {
  const verifier = randomToken();
  return { verifier, state: randomToken(), challenge: challengeS256(verifier) };
};

/** 앞에서 몇 바이트가 일치했는지 드러내지 않고 state를 비교한다. */
export const sameState = (expected: string, received: string): boolean => {
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
};
