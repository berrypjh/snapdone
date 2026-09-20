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
  isRecord(value) && typeof value.status === 'string';

/** Go API를 서버에서 부른다. 응답은 캐시하지 않는다. */
export const apiFetch = (path: string, init: RequestInit = {}): Promise<Response> =>
  fetch(`${getApiBaseUrl()}${path}`, { ...init, cache: 'no-store' });

export const bearer = (credential: string) => ({ Authorization: `Bearer ${credential}` });

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const fetchHealth = async (): Promise<Health> => {
  const response = await apiFetch('/health');

  if (!response.ok) {
    throw new Error(`health 요청이 ${response.status}로 실패했습니다.`);
  }

  const body: unknown = await response.json();

  if (!isHealth(body)) {
    throw new Error('health 응답 형식이 예상과 다릅니다.');
  }

  return body;
};
