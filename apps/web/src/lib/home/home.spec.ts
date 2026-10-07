import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadHome } from './home';

const BASE_URL = 'http://localhost:8080';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const job = { jobId: 'job-1', status: 'failed', createdAt: '2026-10-06T09:00:00Z' };
const preferences = { text: 'summarize', receipt: 'record_expense' };

/** "path"마다 응답을 준다. 없는 요청은 실패시킨다. */
const stubApi = (routes: Record<string, () => Response | Promise<Response>>) => {
  const fetchMock = vi.fn(async (url: string) => {
    const route = routes[url.slice(BASE_URL.length)];
    if (!route) throw new Error(`unexpected ${url}`);
    return route();
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

beforeEach(() => vi.stubEnv('API_BASE_URL', BASE_URL));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('loadHome', () => {
  it('reads both at once', async () => {
    let started = 0;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    stubApi({
      '/v1/processing-jobs': async () => {
        started += 1;
        await gate;
        return json({ jobs: [job] });
      },
      '/v1/processing-preferences': async () => {
        started += 1;
        await gate;
        return json(preferences);
      },
    });

    const loading = loadHome('c');
    await vi.waitFor(() => expect(started).toBe(2));
    release();
    await expect(loading).resolves.toEqual({
      recent: {
        ok: true,
        value: [{ ...job, finishedAt: null, selection: null, outcome: null, sourceJobId: null }],
      },
      preferences: { ok: true, value: preferences },
    });
  });

  it('keeps the preferences when the jobs fail', async () => {
    stubApi({
      '/v1/processing-jobs': () => json({ error: 'provider_unavailable' }, 500),
      '/v1/processing-preferences': () => json(preferences),
    });

    await expect(loadHome('c')).resolves.toEqual({
      recent: { ok: false },
      preferences: { ok: true, value: preferences },
    });
  });

  it('keeps the jobs when the preferences fail, without a default', async () => {
    stubApi({
      '/v1/processing-jobs': () => json({ jobs: [] }),
      '/v1/processing-preferences': () => Promise.reject(new TypeError('fetch failed')),
    });

    await expect(loadHome('c')).resolves.toEqual({
      recent: { ok: true, value: [] },
      preferences: { ok: false },
    });
  });

  it('reports both failures', async () => {
    stubApi({
      '/v1/processing-jobs': () => json({ jobs: 'x' }),
      '/v1/processing-preferences': () => json({ error: 'provider_unavailable' }, 500),
    });

    await expect(loadHome('c')).resolves.toEqual({
      recent: { ok: false },
      preferences: { ok: false },
    });
  });

  it.each(['/v1/processing-jobs', '/v1/processing-preferences'])(
    'is signed out when %s refuses the session',
    async (path) => {
      stubApi({
        '/v1/processing-jobs': () => json({ jobs: [] }),
        '/v1/processing-preferences': () => json(preferences),
        [path]: () => json({ error: 'session_expired' }, 401),
      });

      await expect(loadHome('c')).resolves.toBeNull();
    },
  );
});
