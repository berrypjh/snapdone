import { AUTH_PROVIDERS, type AuthProvider } from './model';
import type { OAuthProof } from './proof';

export type CredentialRead =
  { status: 'found'; credential: string } | { status: 'empty' } | { status: 'unavailable' };

export type PendingProof = OAuthProof & { provider: AuthProvider; createdAt: number };

export type AuthStorage = {
  readCredential: () => Promise<CredentialRead>;
  saveCredential: (credential: string) => Promise<void>;
  deleteCredential: () => Promise<void>;
  saveProof: (proof: PendingProof) => Promise<void>;
  takeProof: (now: number) => Promise<PendingProof | null>;
};

export const PROOF_TTL_MS = 10 * 60 * 1000;

const isString = (value: unknown): value is string => typeof value === 'string' && value !== '';

export const parsePendingProof = (raw: string | null, now: number): PendingProof | null => {
  if (!raw) return null;
  let value: Partial<Record<keyof PendingProof, unknown>>;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  const { verifier, challenge, state, provider, createdAt } = value;
  if (!isString(verifier) || !isString(challenge) || !isString(state)) return null;
  const knownProvider = AUTH_PROVIDERS.find((known) => known === provider);
  if (!knownProvider || typeof createdAt !== 'number') return null;
  if (createdAt > now || now - createdAt > PROOF_TTL_MS) return null;
  return { verifier, challenge, state, provider: knownProvider, createdAt };
};
