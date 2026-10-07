import { ProcessingApiError } from '@snapdone/onboarding';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { jobApi } from './jobApi';

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

const legacy = { selection: null, outcome: null, sourceJobId: null };

const isEntries = (value: unknown): value is Iterable<[string, unknown]> =>
  typeof value === 'object' && value !== null && Symbol.iterator in value;

/** 보낸 multipart 본문의 필드. 테스트에서는 Node의 FormData라 항목을 차례로 읽을 수 있다. */
const formFields = (body: unknown) => {
  if (!isEntries(body)) throw new Error('the body is not a form');
  return new Map(body);
};

const processedBody = {
  jobId: 'job-1',
  status: 'completed',
  result: { category: 'receipt', facts: [], suggestedAction: 'record_expense', confidence: 'high' },
  selection: { imageType: 'receipt', appliedAction: 'summarize' },
  outcome: {
    kind: 'processed',
    imageType: 'receipt',
    appliedAction: 'summarize',
    output: { summary: '카페 봄 결제' },
  },
};

beforeEach(() => vi.stubEnv('EXPO_PUBLIC_API_BASE_URL', BASE_URL));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('jobApi', () => {
  it('uploads the photo by its file address with the bearer credential', async () => {
    const fetchMock = stubFetch(() => json({ jobId: 'job-1', status: 'running' }, 202));

    await expect(jobApi.start('c', image)).resolves.toEqual({
      jobId: 'job-1',
      status: 'running',
      ...legacy,
    });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(`${BASE_URL}/v1/processing-jobs`);
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ Authorization: 'Bearer c' });
    expect(init?.body).toBeInstanceOf(FormData);
    const fields = formFields(init?.body);
    expect(fields.has('image')).toBe(true);
    expect(fields.has('sourceJobId')).toBe(false);
  });

  it('reads a finished job with its product result', async () => {
    stubFetch(() => json(processedBody));
    await expect(jobApi.find('c', 'job/1')).resolves.toEqual({
      ...processedBody,
      sourceJobId: null,
    });
  });

  it('continues an ambiguous job with the same photo and the chosen type', async () => {
    const fetchMock = stubFetch(() =>
      json({ jobId: 'job-2', status: 'running', sourceJobId: 'job-1' }, 202),
    );

    await expect(
      jobApi.reprocess('c', image, { sourceJobId: 'job-1', imageType: 'text' }),
    ).resolves.toMatchObject({ jobId: 'job-2', sourceJobId: 'job-1' });
    const fields = formFields(fetchMock.mock.calls[0]?.[1]?.body);
    expect(fields.has('image')).toBe(true);
    expect(fields.get('sourceJobId')).toBe('job-1');
    expect(fields.get('imageType')).toBe('text');
    expect(fields.has('action')).toBe(false);
  });

  it('confirms one receipt field', async () => {
    const fetchMock = stubFetch(() => json(processedBody));

    await jobApi.resolveField('c', { jobId: 'job-1', field: 'total', value: '13000' });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(`${BASE_URL}/v1/processing-jobs/job-1/receipt-fields/total`);
    expect(init?.method).toBe('PATCH');
    expect(init?.body).toBe('{"value":"13000"}');
  });

  it('is null when the server no longer accepts the session', async () => {
    stubFetch(() => json({ error: 'session_expired' }, 401));
    await expect(jobApi.find('c', 'job-1')).resolves.toBeNull();
  });

  it.each([
    ['the server code', () => json({ error: 'image_mismatch' }, 409), 'image_mismatch'],
    [
      'unknown for a body outside the contract',
      () => json({ ...processedBody, outcome: { kind: 'done' } }),
      'unknown',
    ],
    [
      'network when the request never arrives',
      () => Promise.reject(new TypeError('Network request failed')),
      'network',
    ],
  ])('fails with %s', async (_name, response, code) => {
    stubFetch(response);
    await expect(errorCode(jobApi.find('c', 'job-1'))).resolves.toBe(code);
  });

  it('reprocesses the same photo with another action, without a type and without touching preferences', async () => {
    const fetchMock = stubFetch(() =>
      json({ jobId: 'job-2', status: 'running', sourceJobId: 'job-1' }, 202),
    );

    await jobApi.reprocess('c', image, { sourceJobId: 'job-1', action: 'summarize' });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(`${BASE_URL}/v1/processing-jobs`);
    const fields = formFields(init?.body);
    expect(fields.get('sourceJobId')).toBe('job-1');
    expect(fields.get('action')).toBe('summarize');
    expect(fields.has('imageType')).toBe(false);
  });
});
