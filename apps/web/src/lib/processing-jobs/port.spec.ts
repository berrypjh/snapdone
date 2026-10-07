import { MAX_IMAGE_BYTES, ProcessingApiError, runProcessing } from '@snapdone/onboarding';
import type { JobDetail } from '@snapdone/processing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { findJob, startPhotoJob } from './actions';
import { createJobPort } from './port';

vi.mock('./actions', () => ({ startPhotoJob: vi.fn(), findJob: vi.fn() }));

const start = vi.mocked(startPhotoJob);
const find = vi.mocked(findJob);

const photo = new File(['png'], 'photo.png', { type: 'image/png' });

const codeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => (error instanceof ProcessingApiError ? error.code : error),
  );

const legacy = { selection: null, outcome: null, sourceJobId: null };
const running: JobDetail = { jobId: 'job-1', status: 'running', ...legacy };
const done: JobDetail = {
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
  sourceJobId: null,
};

beforeEach(() => vi.resetAllMocks());

describe('createJobPort', () => {
  it('sends the photo as the image field and returns the job with its product result', async () => {
    start.mockResolvedValue({ type: 'job', job: running });

    await expect(createJobPort(vi.fn()).start(photo)).resolves.toEqual(running);
    expect(start.mock.calls[0]?.[0].get('image')).toBe(photo);
  });

  it('refuses a photo over the Go limit without uploading it', async () => {
    const large = new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], 'large.png');

    await expect(codeOf(createJobPort(vi.fn()).start(large))).resolves.toBe('image_too_large');
    expect(start).not.toHaveBeenCalled();
  });

  it('turns an error response into the server code, and a failed call into network', async () => {
    start.mockResolvedValue({ type: 'error', code: 'unsupported_image' });
    await expect(codeOf(createJobPort(vi.fn()).start(photo))).resolves.toBe('unsupported_image');

    find.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(codeOf(createJobPort(vi.fn()).find('job-1'))).resolves.toBe('network');
  });

  it('stops and tells the page when the session is gone', async () => {
    const onSignedOut = vi.fn();
    find.mockResolvedValue({ type: 'signed-out' });

    await expect(createJobPort(onSignedOut).find('job-1')).resolves.toBeNull();
    expect(onSignedOut).toHaveBeenCalledOnce();
  });

  it('polls a running job until it finishes and hands over the whole finished job', async () => {
    start.mockResolvedValue({ type: 'job', job: running });
    find.mockResolvedValueOnce({ type: 'job', job: running });
    find.mockResolvedValueOnce({ type: 'job', job: done });
    const port = { ...createJobPort(vi.fn()), wait: async () => undefined };
    const states: unknown[] = [];

    await runProcessing(
      port,
      photo,
      (state) => states.push(state),
      () => false,
    );

    expect(start).toHaveBeenCalledOnce();
    expect(find).toHaveBeenCalledTimes(2);
    expect(states.at(-1)).toEqual({
      status: 'completed',
      jobId: 'job-1',
      result: done.status === 'completed' ? done.result : null,
      job: done,
    });
  });

  it('starts a reprocess with the given action and fields on the same photo', async () => {
    const reprocess = vi.fn(async (_form: FormData) => ({ type: 'job', job: running }) as const);
    await createJobPort(vi.fn(), reprocess, { sourceJobId: 'job-1', action: 'summarize' }).start(
      photo,
    );

    const form = reprocess.mock.calls[0]?.[0];
    expect(form?.get('image')).toBe(photo);
    expect(form?.get('sourceJobId')).toBe('job-1');
    expect(form?.get('action')).toBe('summarize');
    expect(start).not.toHaveBeenCalled();
  });
});
