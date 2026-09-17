export type ProofCrypto = {
  randomBytes: (length: number) => Uint8Array;
  sha256: (data: Uint8Array) => Promise<Uint8Array>;
};

export type OAuthProof = {
  verifier: string;
  challenge: string;
  state: string;
};

const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export const base64Url = (bytes: Uint8Array): string => {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const chunk = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const chars = Math.min(4, Math.ceil(((bytes.length - i) * 8) / 6));
    for (let c = 0; c < chars; c += 1) {
      out += BASE64URL[(chunk >> (18 - 6 * c)) & 63];
    }
  }
  return out;
};

const encodeAscii = (text: string) => Uint8Array.from(text, (char) => char.charCodeAt(0));

export const s256Challenge = async (verifier: string, crypto: ProofCrypto): Promise<string> =>
  base64Url(await crypto.sha256(encodeAscii(verifier)));

export const createProof = async (crypto: ProofCrypto): Promise<OAuthProof> => {
  const verifier = base64Url(crypto.randomBytes(32));
  return {
    verifier,
    challenge: await s256Challenge(verifier, crypto),
    state: base64Url(crypto.randomBytes(32)),
  };
};
