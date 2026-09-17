import { type AuthErrorCode, toAuthErrorCode } from './model';

export type OAuthCallback =
  | { type: 'code'; code: string; state: string }
  | { type: 'error'; error: AuthErrorCode; state: string };

const parseQuery = (query: string): Map<string, string> | null => {
  const params = new Map<string, string>();
  for (const pair of query.split('&')) {
    if (!pair) continue;
    const [rawKey, rawValue = ''] = pair.split('=', 2);
    try {
      const key = decodeURIComponent(rawKey.replace(/\+/g, ' '));
      if (params.has(key)) return null;
      params.set(key, decodeURIComponent(rawValue.replace(/\+/g, ' ')));
    } catch {
      return null;
    }
  }
  return params;
};

export const parseOAuthCallback = (url: string, redirectUri: string): OAuthCallback | null => {
  if (url.includes('#')) return null;
  const [base, query = ''] = url.split('?', 2);
  if (base !== redirectUri || url.split('?').length > 2) return null;

  const params = parseQuery(query);
  const state = params?.get('state');
  if (!params || !state) return null;

  const code = params.get('code');
  const error = params.get('error');
  if (code && !error) return { type: 'code', code, state };
  if (error && !code) return { type: 'error', error: toAuthErrorCode(error), state };
  return null;
};
