import type { ProviderModelList } from './variant-command';

/**
 * 서버 전용. 새로고침(요청)마다 공급자의 모델 목록 API를 부른다. key는 DevHub를 띄운 프로세스의 환경변수에서만
 * 읽고 요청 헤더에만 쓴다 — 화면 · 브라우저 · 파일 · 오류 문구에 싣지 않는다. key가 없거나 실패하면 이유만 남긴다.
 */

type Env = Record<string, string | undefined>;
type Fetch = typeof fetch;

const TIMEOUT_MS = 5000;

/** 사진 분류에 쓸 수 없는 OpenAI 모델(음성 · 임베딩 · 이미지 생성 · 검수 등). 이름으로만 거른다. */
const OPENAI_EXCLUDE = [
  'audio',
  'realtime',
  'tts',
  'transcribe',
  'embedding',
  'image',
  'dall-e',
  'whisper',
  'moderation',
  'search',
  'instruct',
];

const isOpenAIChat = (id: string) =>
  /^(gpt-|o\d)/.test(id) && !OPENAI_EXCLUDE.some((word) => id.includes(word));

const get = async (fetcher: Fetch, url: string, headers: Record<string, string>) => {
  const response = await fetcher(url, {
    headers,
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as { data?: unknown };
};

const failure = (error: unknown) =>
  error instanceof Error && /^HTTP \d+$/.test(error.message)
    ? error.message
    : error instanceof Error && error.name === 'TimeoutError'
      ? `${TIMEOUT_MS / 1000}초 안에 응답 없음`
      : '연결 실패';

const anthropic = async (env: Env, fetcher: Fetch): Promise<ProviderModelList> => {
  const key = env.ANTHROPIC_API_KEY;
  if (!key) return { provider: 'anthropic', state: 'no-key', models: [] };
  try {
    const body = await get(fetcher, 'https://api.anthropic.com/v1/models?limit=100', {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    });
    const models = (Array.isArray(body.data) ? body.data : []).flatMap(
      (m: Record<string, unknown>) =>
        typeof m.id === 'string'
          ? [
              {
                id: m.id,
                name: typeof m.display_name === 'string' ? m.display_name : m.id,
                created: typeof m.created_at === 'string' ? m.created_at.slice(0, 10) : null,
              },
            ]
          : [],
    );
    return { provider: 'anthropic', state: 'ok', models: newestFirst(models) };
  } catch (error) {
    return { provider: 'anthropic', state: 'failed', models: [], reason: failure(error) };
  }
};

const openai = async (env: Env, fetcher: Fetch): Promise<ProviderModelList> => {
  const key = env.OPENAI_API_KEY;
  if (!key) return { provider: 'openai', state: 'no-key', models: [] };
  try {
    const body = await get(fetcher, 'https://api.openai.com/v1/models', {
      authorization: `Bearer ${key}`,
    });
    const models = (Array.isArray(body.data) ? body.data : []).flatMap(
      (m: Record<string, unknown>) =>
        typeof m.id === 'string' && isOpenAIChat(m.id)
          ? [
              {
                id: m.id,
                name: m.id,
                created:
                  typeof m.created === 'number'
                    ? new Date(m.created * 1000).toISOString().slice(0, 10)
                    : null,
              },
            ]
          : [],
    );
    return { provider: 'openai', state: 'ok', models: newestFirst(models) };
  } catch (error) {
    return { provider: 'openai', state: 'failed', models: [], reason: failure(error) };
  }
};

const newestFirst = <T extends { id: string; created: string | null }>(models: T[]) =>
  [...models].sort(
    (a, b) => (b.created ?? '').localeCompare(a.created ?? '') || a.id.localeCompare(b.id),
  );

/** 두 공급자를 함께 부른다. 하나가 실패해도 다른 쪽은 보인다. */
export const fetchProviderModels = (env: Env = process.env, fetcher: Fetch = fetch) =>
  Promise.all([anthropic(env, fetcher), openai(env, fetcher)]);
