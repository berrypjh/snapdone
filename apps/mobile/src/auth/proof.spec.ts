import { describe, expect, it } from 'vitest';

import { base64Url, createProof, type ProofCrypto, s256Challenge } from './proof';

const webCrypto = (
  globalThis as unknown as {
    crypto: {
      getRandomValues: (array: Uint8Array) => Uint8Array;
      subtle: { digest: (algorithm: string, data: Uint8Array) => Promise<ArrayBuffer> };
    };
  }
).crypto;

const nodeCrypto: ProofCrypto = {
  randomBytes: (length) => webCrypto.getRandomValues(new Uint8Array(length)),
  sha256: async (data) => new Uint8Array(await webCrypto.subtle.digest('SHA-256', data)),
};

describe('base64Url', () => {
  it.each([
    [[], ''],
    [[0xfb], '-w'],
    [[0xfb, 0xff], '-_8'],
    [[0xfb, 0xff, 0xbf], '-_-_'],
    [[0x66, 0x6f, 0x6f, 0x62], 'Zm9vYg'],
  ])('encodes %j as %s without padding', (bytes, expected) => {
    expect(base64Url(Uint8Array.from(bytes))).toBe(expected);
  });
});

describe('s256Challenge', () => {
  it('matches the RFC 7636 Appendix B vector', async () => {
    await expect(
      s256Challenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk', nodeCrypto),
    ).resolves.toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });
});

describe('createProof', () => {
  it('produces 43-character base64url verifier and state with a matching challenge', async () => {
    const proof = await createProof(nodeCrypto);

    for (const value of [proof.verifier, proof.state, proof.challenge]) {
      expect(value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    }
    expect(proof.challenge).toBe(await s256Challenge(proof.verifier, nodeCrypto));
  });

  it('does not reuse randomness between verifier and state or across proofs', async () => {
    const [a, b] = await Promise.all([createProof(nodeCrypto), createProof(nodeCrypto)]);

    expect(a.verifier).not.toBe(a.state);
    expect(a.verifier).not.toBe(b.verifier);
  });
});
