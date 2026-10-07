import { ProcessingApiError } from '@snapdone/onboarding';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchJob, fetchRecentJobs, reprocessJob, resolveReceiptField } from './api';

const BASE_URL = 'http://localhost:8080';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const stubFetch = (response: () => Response | Promise<Response>) => {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => response());
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

beforeEach(() => vi.stubEnv('API_BASE_URL', BASE_URL));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('fetchRecentJobs', () => {
  it('reads the recent jobs with the bearer credential', async () => {
    const fetchMock = stubFetch(() =>
      json({ jobs: [{ jobId: 'job-1', status: 'running', createdAt: '2026-10-06T09:00:00Z' }] }),
    );

    await expect(fetchRecentJobs('c')).resolves.toEqual([
      {
        jobId: 'job-1',
        status: 'running',
        createdAt: '2026-10-06T09:00:00Z',
        finishedAt: null,
        selection: null,
        outcome: null,
        sourceJobId: null,
      },
    ]);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(`${BASE_URL}/v1/processing-jobs`);
    expect(init?.headers).toEqual({ Authorization: 'Bearer c' });
  });

  it('returns null when Go no longer accepts the session', async () => {
    stubFetch(() => json({ error: 'session_expired' }, 401));

    await expect(fetchRecentJobs('c')).resolves.toBeNull();
  });

  it('fails on a server error', async () => {
    stubFetch(() => json({ error: 'provider_unavailable' }, 500));

    await expect(fetchRecentJobs('c')).rejects.toThrow('500');
  });

  it('fails on a response outside the contract', async () => {
    stubFetch(() => json({ jobs: [{ jobId: 'job-1' }] }));

    await expect(fetchRecentJobs('c')).rejects.toThrow('형식');
  });
});

const processedJob = {
  jobId: 'job-1',
  status: 'completed',
  result: { category: 'foreign_text', facts: [], suggestedAction: 'translate', confidence: 'high' },
  selection: { imageType: 'text', appliedAction: 'extract_text' },
  outcome: {
    kind: 'processed',
    imageType: 'text',
    appliedAction: 'extract_text',
    output: { original: 'Exit only' },
  },
};

describe('fetchJob', () => {
  it('reads one job with its selection and outcome', async () => {
    const fetchMock = stubFetch(() => json(processedJob));

    await expect(fetchJob('c', 'job/1')).resolves.toEqual({ ...processedJob, sourceJobId: null });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(`${BASE_URL}/v1/processing-jobs/job%2F1`);
    expect(init?.headers).toEqual({ Authorization: 'Bearer c' });
  });

  it('returns null when Go no longer accepts the session', async () => {
    stubFetch(() => json({ error: 'session_expired' }, 401));
    await expect(fetchJob('c', 'job-1')).resolves.toBeNull();
  });

  it.each([
    ['a missing job', () => json({ error: 'job_not_found' }, 404), 'job_not_found'],
    ['a server error', () => json({ error: 'provider_unavailable' }, 500), 'provider_unavailable'],
    [
      'a body outside the contract',
      () => json({ ...processedJob, outcome: { kind: 'done' } }),
      'unknown',
    ],
    ['an error without a body', () => new Response('oops', { status: 502 }), 'unknown'],
  ])('throws the server code for %s', async (_name, response, code) => {
    stubFetch(response);
    await expect(fetchJob('c', 'job-1')).rejects.toEqual(new ProcessingApiError(code));
  });
});

describe('reprocessJob', () => {
  it('sends the same photo with the source job and the chosen type', async () => {
    const fetchMock = stubFetch(() =>
      json({ jobId: 'job-2', status: 'running', sourceJobId: 'job-1' }, 202),
    );
    const image = new Blob(['photo'], { type: 'image/png' });

    await expect(
      reprocessJob('c', { image, sourceJobId: 'job-1', imageType: 'receipt' }),
    ).resolves.toEqual({
      jobId: 'job-2',
      status: 'running',
      selection: null,
      outcome: null,
      sourceJobId: 'job-1',
    });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(`${BASE_URL}/v1/processing-jobs`);
    expect(init?.method).toBe('POST');
    const body = init?.body as FormData;
    expect(body.get('sourceJobId')).toBe('job-1');
    expect(body.get('imageType')).toBe('receipt');
    expect(body.get('image')).toBeInstanceOf(Blob);
    expect(body.has('action')).toBe(false);
  });

  it('throws the server code when the photo differs', async () => {
    stubFetch(() => json({ error: 'image_mismatch' }, 409));
    await expect(
      reprocessJob('c', { image: new Blob(['x']), sourceJobId: 'job-1', imageType: 'text' }),
    ).rejects.toEqual(new ProcessingApiError('image_mismatch'));
  });
});

describe('resolveReceiptField', () => {
  it('patches one field and reads the job the server returns', async () => {
    const fetchMock = stubFetch(() => json(processedJob));

    await expect(
      resolveReceiptField('c', { jobId: 'job-1', field: 'total', value: '13000' }),
    ).resolves.toMatchObject({ jobId: 'job-1' });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(`${BASE_URL}/v1/processing-jobs/job-1/receipt-fields/total`);
    expect(init?.method).toBe('PATCH');
    expect(init?.body).toBe('{"value":"13000"}');
    expect(init?.headers).toEqual({
      Authorization: 'Bearer c',
      'Content-Type': 'application/json',
    });
  });

  it('throws the server code for an already resolved field', async () => {
    stubFetch(() => json({ error: 'receipt_field_resolved' }, 409));
    await expect(
      resolveReceiptField('c', { jobId: 'job-1', field: 'total', value: '13000' }),
    ).rejects.toEqual(new ProcessingApiError('receipt_field_resolved'));
  });
});
