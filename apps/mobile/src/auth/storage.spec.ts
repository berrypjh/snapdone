import { describe, expect, it } from 'vitest';

import { parsePendingProof, type PendingProof, PROOF_TTL_MS } from './storage';

const NOW = 1_800_000_000_000;

const proof: PendingProof = {
  verifier: 'v'.repeat(43),
  challenge: 'c'.repeat(43),
  state: 's'.repeat(43),
  provider: 'kakao',
  createdAt: NOW - 1000,
};

describe('parsePendingProof', () => {
  it('returns a fresh proof', () => {
    expect(parsePendingProof(JSON.stringify(proof), NOW)).toEqual(proof);
  });

  it('drops a proof older than the TTL', () => {
    const stale = { ...proof, createdAt: NOW - PROOF_TTL_MS - 1 };

    expect(parsePendingProof(JSON.stringify(stale), NOW)).toBeNull();
  });

  it.each([
    ['nothing stored', null],
    ['not JSON', '{'],
    ['unknown provider', JSON.stringify({ ...proof, provider: 'email' })],
    ['missing verifier', JSON.stringify({ ...proof, verifier: '' })],
    ['future timestamp', JSON.stringify({ ...proof, createdAt: NOW + 1 })],
  ])('drops %s', (_, raw) => {
    expect(parsePendingProof(raw, NOW)).toBeNull();
  });
});
