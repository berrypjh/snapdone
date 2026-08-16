/**
 * The one place the web app learns where the API is.
 *
 * There is no NEXT_PUBLIC_ prefix on purpose: nothing in the browser bundle
 * calls the Go API today, so the value stays server-side. Adding a browser
 * call means adding CORS on the Go side — read docs/architecture/data-access.md
 * before doing that.
 */

export type Health = {
  status: string;
};

export const getApiBaseUrl = (): string => {
  const value = process.env.API_BASE_URL;

  if (!value) {
    throw new Error(
      'API_BASE_URL이 설정되지 않았습니다. apps/web/.env.example을 apps/web/.env.local로 복사하세요.',
    );
  }

  return value.replace(/\/+$/, '');
};

const isHealth = (value: unknown): value is Health =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as Record<string, unknown>).status === 'string';

/** Calls the API health endpoint. Server-side only. */
export const fetchHealth = async (): Promise<Health> => {
  const response = await fetch(`${getApiBaseUrl()}/health`, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`health 요청이 ${response.status}로 실패했습니다.`);
  }

  const body: unknown = await response.json();

  if (!isHealth(body)) {
    throw new Error('health 응답 형식이 예상과 다릅니다.');
  }

  return body;
};
