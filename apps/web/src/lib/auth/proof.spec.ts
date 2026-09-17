import { describe, expect, it } from 'vitest';

import { challengeS256, createLoginProof, sameState } from './proof';

const BASE64URL_32_BYTES = /^[A-Za-z0-9_-]{43}$/;

describe('challengeS256', () => {
  it('matches the RFC 7636 example', () => {
    expect(challengeS256('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });
});

describe('createLoginProof', () => {
  it('makes a 32-byte verifier and state in the shape Go accepts', () => {
    const proof = createLoginProof();

    expect(proof.verifier).toMatch(BASE64URL_32_BYTES);
    expect(proof.state).toMatch(BASE64URL_32_BYTES);
    expect(proof.challenge).toBe(challengeS256(proof.verifier));
  });

  it('never repeats', () => {
    const [a, b] = [createLoginProof(), createLoginProof()];

    expect(a.state).not.toBe(b.state);
    expect(a.verifier).not.toBe(b.verifier);
  });
});

describe('sameState', () => {
  it('accepts only an identical state', () => {
    expect(sameState('abc', 'abc')).toBe(true);
    expect(sameState('abc', 'abd')).toBe(false);
    expect(sameState('abc', 'abcd')).toBe(false);
    expect(sameState('abc', '')).toBe(false);
  });
});
