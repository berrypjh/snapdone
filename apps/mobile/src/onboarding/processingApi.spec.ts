import { ProcessingApiError } from '@snapdone/onboarding';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { processingApi } from './processingApi';

const BASE_URL = 'http://192.168.0.10:8080';
const image = { uri: 'file:///cache/photo.jpg' };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const stubFetch = (response: () => Response | Promise<Response>) => {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => response());
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const errorCode = (promise: Promise<unknown>) =>
  promise.then(
    () => 'resolved',
    (error: unknown) => (error instanceof ProcessingApiError ? error.code : String(error)),
  );

/** 처리 결과 계약 전의 모양으로 온 작업은 selection · outcome · 원래 작업이 없다. */
const legacy = { selection: null, outcome: null, sourceJobId: null };

const completedBody = {
  jobId: 'job-1',
  status: 'completed',
  result: {
    category: 'receipt',
    facts: [{ label: '금액', value: '12,000원' }],
    suggestedAction: 'record_expense',
    confidence: 'medium',
  },
};

beforeEach(() => vi.stubEnv('EXPO_PUBLIC_API_BASE_URL', BASE_URL));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('start', () => {
  it('uploads the photo with the bearer credential', async () => {
    const fetchMock = stubFetch(() => json({ jobId: 'job-1', status: 'running' }, 202));

    await expect(processingApi.start('c', image)).resolves.toEqual({
      jobId: 'job-1',
      status: 'running',
      ...legacy,
    });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(`${BASE_URL}/v1/processing-jobs`);
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ Authorization: 'Bearer c' });
    expect(init?.body).toBeInstanceOf(FormData);
  });

  it('returns null when Go no longer accepts the session', async () => {
    stubFetch(() => json({ error: 'session_expired' }, 401));

    await expect(processingApi.start('c', image)).resolves.toBeNull();
  });

  it('keeps the server error code', async () => {
    stubFetch(() => json({ error: 'image_too_large' }, 413));

    await expect(errorCode(processingApi.start('c', image))).resolves.toBe('image_too_large');
  });

  it('reports network when the request never completes', async () => {
    stubFetch(() => Promise.reject(new TypeError('Network request failed')));

    await expect(errorCode(processingApi.start('c', image))).resolves.toBe('network');
  });
});

describe('find', () => {
  it('reads a completed job with its result', async () => {
    const fetchMock = stubFetch(() => json(completedBody));

    await expect(processingApi.find('c', 'job/1')).resolves.toEqual({
      ...completedBody,
      ...legacy,
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE_URL}/v1/processing-jobs/job%2F1`);
  });

  it('rejects a response it cannot read', async () => {
    stubFetch(() => json({ jobId: 'job-1', status: 'done' }));

    await expect(errorCode(processingApi.find('c', 'job-1'))).resolves.toBe('unknown');
  });
});
