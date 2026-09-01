export type Health = {
  status: string;
};

export const getApiBaseUrl = (): string => {
  const value = process.env.EXPO_PUBLIC_API_BASE_URL;

  if (!value) {
    throw new Error(
      'EXPO_PUBLIC_API_BASE_URL이 설정되지 않았습니다. apps/mobile/.env.example을 apps/mobile/.env로 복사하고 Metro를 --clear로 재시작하세요.',
    );
  }

  return value.replace(/\/+$/, '');
};

const isHealth = (value: unknown): value is Health =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as Record<string, unknown>).status === 'string';

export const fetchHealth = async (): Promise<Health> => {
  const response = await fetch(`${getApiBaseUrl()}/health`);

  if (!response.ok) {
    throw new Error(`health 요청이 ${response.status}로 실패했습니다.`);
  }

  const body: unknown = await response.json();

  if (!isHealth(body)) {
    throw new Error('health 응답 형식이 예상과 다릅니다.');
  }

  return body;
};
