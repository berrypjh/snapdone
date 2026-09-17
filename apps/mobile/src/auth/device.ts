import { CryptoDigestAlgorithm, digest, getRandomBytes } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { openAuthSessionAsync } from 'expo-web-browser';

import type { AuthBrowser } from './google';
import type { ProofCrypto } from './proof';
import { type AuthStorage, parsePendingProof } from './storage';

const CREDENTIAL_KEY = 'snapdone.session';
const PROOF_KEY = 'snapdone.oauth-proof';

const credentialOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

const proofOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export const secureAuthStorage: AuthStorage = {
  readCredential: async () => {
    try {
      const credential = await SecureStore.getItemAsync(CREDENTIAL_KEY, credentialOptions);
      return credential ? { status: 'found', credential } : { status: 'empty' };
    } catch {
      return { status: 'unavailable' };
    }
  },
  saveCredential: (credential) =>
    SecureStore.setItemAsync(CREDENTIAL_KEY, credential, credentialOptions),
  deleteCredential: () => SecureStore.deleteItemAsync(CREDENTIAL_KEY, credentialOptions),
  saveProof: (proof) => SecureStore.setItemAsync(PROOF_KEY, JSON.stringify(proof), proofOptions),
  takeProof: async (now) => {
    const raw = await SecureStore.getItemAsync(PROOF_KEY, proofOptions);
    await SecureStore.deleteItemAsync(PROOF_KEY, proofOptions);
    return parsePendingProof(raw, now);
  },
};

export const expoProofCrypto: ProofCrypto = {
  randomBytes: getRandomBytes,
  sha256: async (data) => new Uint8Array(await digest(CryptoDigestAlgorithm.SHA256, data)),
};

export const systemAuthBrowser: AuthBrowser = {
  openAuthSession: async (url, redirectUri) => {
    const result = await openAuthSessionAsync(url, redirectUri);
    return result.type === 'success' ? { type: 'success', url: result.url } : { type: 'cancel' };
  },
};
