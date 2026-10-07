import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const request = vi.hoisted(() => ({
  origin: null as string | null,
  credential: null as string | null,
}));

vi.mock('next/headers', () => ({
  headers: async () => new Headers(request.origin ? { origin: request.origin } : {}),
  cookies: async () => ({
    get: (name: string) =>
      name === 'snapdone-session-dev' && request.credential !== null
        ? { name, value: request.credential }
        : undefined,
  }),
}));

const { chooseImageType, confirmReceiptField, findJob, reprocessWithAction, startPhotoJob } =
  await import('./actions');

const ORIGIN = 'http://localhost:3000';
const BASE_URL = 'http://localhost:8080';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const stubFetch = (response: () => Response | Promise<Response>) => {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => response());
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const running = { jobId: 'job-2', status: 'running' };

const choice = (fields: Record<string, string | Blob>) => {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  return form;
};

beforeEach(() => {
  vi.stubEnv('API_BASE_URL', BASE_URL);
  vi.stubEnv('WEB_ORIGIN', ORIGIN);
  request.origin = ORIGIN;
  request.credential = 'c';
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('processing job actions', () => {
  it('starts one photo as the image field', async () => {
    const fetchMock = stubFetch(() => json(running, 202));
    const image = new Blob(['photo']);
    await expect(startPhotoJob(choice({ image }))).resolves.toMatchObject({
      type: 'job',
      job: { jobId: 'job-2', status: 'running' },
    });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(`${BASE_URL}/v1/processing-jobs`);
    expect((init?.body as FormData).get('image')).toBeInstanceOf(Blob);
    expect(await startPhotoJob(choice({}))).toEqual({ type: 'error', code: 'invalid_image' });
  });

  it('returns the job the server sent', async () => {
    stubFetch(() => json(running));
    await expect(findJob('job-2')).resolves.toEqual({
      type: 'job',
      job: { ...running, selection: null, outcome: null, sourceJobId: null },
    });
  });

  it('is signed out without a session cookie or when Go refuses the session', async () => {
    request.credential = null;
    await expect(findJob('job-2')).resolves.toEqual({ type: 'signed-out' });
    request.credential = 'c';
    stubFetch(() => json({ error: 'session_expired' }, 401));
    await expect(confirmReceiptField('job-1', 'total', '13000')).resolves.toEqual({
      type: 'signed-out',
    });
  });

  it('returns the server code, or network when Go is not reachable', async () => {
    stubFetch(() => json({ error: 'invalid_receipt_field' }, 400));
    await expect(confirmReceiptField('job-1', 'total', '12,000원')).resolves.toEqual({
      type: 'error',
      code: 'invalid_receipt_field',
    });
    stubFetch(() => Promise.reject(new TypeError('fetch failed')));
    await expect(findJob('job-1')).resolves.toEqual({ type: 'error', code: 'network' });
  });

  it('refuses a request from another origin', async () => {
    request.origin = 'https://evil.example';
    await expect(confirmReceiptField('job-1', 'total', '13000')).rejects.toThrow();
  });

  it('continues an ambiguous job with the held photo and the chosen type', async () => {
    const fetchMock = stubFetch(() => json({ ...running, sourceJobId: 'job-1' }, 202));
    await expect(
      chooseImageType(
        choice({ image: new Blob(['photo']), sourceJobId: 'job-1', imageType: 'text' }),
      ),
    ).resolves.toMatchObject({ type: 'job', job: { jobId: 'job-2', sourceJobId: 'job-1' } });
    const body = fetchMock.mock.calls[0]?.[1]?.body as FormData;
    expect(body.get('imageType')).toBe('text');
  });

  it.each([
    ['no photo', { sourceJobId: 'job-1', imageType: 'text' }],
    ['no source job', { image: new Blob(['photo']), imageType: 'text' }],
    [
      'a type outside the product',
      { image: new Blob(['photo']), sourceJobId: 'job-1', imageType: 'place' },
    ],
  ])('refuses a type choice with %s without calling Go', async (_name, fields) => {
    const fetchMock = stubFetch(() => json(running));
    await expect(chooseImageType(choice(fields))).resolves.toEqual({
      type: 'error',
      code: 'invalid_reprocess',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reprocesses the held photo with another action and sends no type', async () => {
    const fetchMock = stubFetch(() => json({ ...running, sourceJobId: 'job-1' }, 202));
    await expect(
      reprocessWithAction(
        choice({ image: new Blob(['photo']), sourceJobId: 'job-1', action: 'summarize' }),
      ),
    ).resolves.toMatchObject({ type: 'job', job: { sourceJobId: 'job-1' } });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(`${BASE_URL}/v1/processing-jobs`);
    const body = init?.body as FormData;
    expect(body.get('action')).toBe('summarize');
    expect(body.get('sourceJobId')).toBe('job-1');
    expect(body.has('imageType')).toBe(false);
    // Reprocessing never touches the stored preferences.
    expect(fetchMock.mock.calls.some(([called]) => called.includes('processing-preferences'))).toBe(
      false,
    );
  });

  it('refuses a reprocess without a photo, a source job or an action', async () => {
    const fetchMock = stubFetch(() => json(running));
    const invalid: Record<string, string | Blob>[] = [
      { sourceJobId: 'job-1', action: 'summarize' },
      { image: new Blob(['photo']), action: 'summarize' },
      { image: new Blob(['photo']), sourceJobId: 'job-1', action: '' },
    ];
    for (const fields of invalid) {
      await expect(reprocessWithAction(choice(fields))).resolves.toEqual({
        type: 'error',
        code: 'invalid_reprocess',
      });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
