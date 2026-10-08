import { ProcessingApiError } from '@snapdone/onboarding';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  completeProgress,
  fetchProcessingJob,
  fetchProgress,
  ProgressConflictError,
  saveProgress,
  startProcessingJob,
} from './api';

const BASE_URL = 'http://localhost:8080';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const stubFetch = (response: () => Response | Promise<Response>) => {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => response());
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const codeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => (error instanceof ProcessingApiError ? error.code : error),
  );

beforeEach(() => vi.stubEnv('API_BASE_URL', BASE_URL));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('progress', () => {
  it('reads the saved progress with the bearer credential', async () => {
    const fetchMock = stubFetch(() => json({ step: 'first-image' }));

    await expect(fetchProgress('c')).resolves.toEqual({ step: 'first-image' });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(`${BASE_URL}/v1/onboarding`);
    expect(init?.headers).toEqual({ Authorization: 'Bearer c' });
  });

  it('saves with PUT and a JSON body', async () => {
    const fetchMock = stubFetch(() => json({ step: 'first-image' }));

    await saveProgress('c', { step: 'first-image' });
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.method).toBe('PUT');
    expect(init?.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer c',
    });
    expect(init?.body).toBe('{"step":"first-image"}');
  });

  it('returns null when Go no longer accepts the session', async () => {
    stubFetch(() => json({ error: 'session_expired' }, 401));

    await expect(fetchProgress('c')).resolves.toBeNull();
  });

  it('reports a conflict when the server moved on first', async () => {
    stubFetch(() => json({ error: 'onboarding_out_of_order' }, 409));

    await expect(saveProgress('c', { step: 'intro' })).rejects.toBeInstanceOf(
      ProgressConflictError,
    );
  });

  it('rejects a response outside the contract', async () => {
    stubFetch(() => json({ step: 'purpose' }));

    await expect(fetchProgress('c')).rejects.toThrow();
  });
});

describe('completion', () => {
  it('posts to the completion endpoint with the bearer credential and no body', async () => {
    const fetchMock = stubFetch(() => json({ step: 'complete' }));

    await expect(completeProgress('c')).resolves.toEqual({ step: 'complete' });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(`${BASE_URL}/v1/onboarding/complete`);
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ Authorization: 'Bearer c' });
    expect(init?.body).toBeUndefined();
  });

  it('returns null when Go no longer accepts the session', async () => {
    stubFetch(() => json({ error: 'session_expired' }, 401));

    await expect(completeProgress('c')).resolves.toBeNull();
  });

  it('reports a conflict when the onboarding is not at the first photo yet', async () => {
    stubFetch(() => json({ error: 'onboarding_out_of_order' }, 409));

    await expect(completeProgress('c')).rejects.toBeInstanceOf(ProgressConflictError);
  });

  it.each([{ step: 'first-image' }, { step: 'purpose' }, { error: 'provider_unavailable' }])(
    'rejects a successful response that is not a finished onboarding: %j',
    async (body) => {
      stubFetch(() => json(body));

      await expect(completeProgress('c')).rejects.toThrow();
    },
  );

  it('fails on a server error', async () => {
    stubFetch(() => json({ error: 'provider_unavailable' }, 500));

    await expect(completeProgress('c')).rejects.toThrow();
  });
});

describe('processing', () => {
  it('uploads the image as the multipart field image', async () => {
    const fetchMock = stubFetch(() => json({ jobId: 'job-1', status: 'running' }, 202));

    await expect(startProcessingJob('c', new Blob(['png']))).resolves.toEqual({
      jobId: 'job-1',
      status: 'running',
      selection: null,
      outcome: null,
      sourceJobId: null,
    });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(`${BASE_URL}/v1/processing-jobs`);
    expect(init?.method).toBe('POST');
    expect((init?.body as FormData).get('image')).toBeInstanceOf(Blob);
  });

  it('keeps the server error code', async () => {
    stubFetch(() => json({ error: 'unsupported_image' }, 415));

    await expect(codeOf(startProcessingJob('c', new Blob(['txt'])))).resolves.toBe(
      'unsupported_image',
    );
  });

  it('reports network when Go cannot be reached', async () => {
    stubFetch(() => Promise.reject(new TypeError('fetch failed')));

    await expect(codeOf(fetchProcessingJob('c', 'job-1'))).resolves.toBe('network');
  });

  it('escapes the job id in the path', async () => {
    const fetchMock = stubFetch(() => json({ jobId: 'job/1', status: 'failed' }));

    await fetchProcessingJob('c', 'job/1');
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE_URL}/v1/processing-jobs/job%2F1`);
  });
});
