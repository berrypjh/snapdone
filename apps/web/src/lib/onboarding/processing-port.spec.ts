import { MAX_IMAGE_BYTES, ProcessingApiError } from '@snapdone/onboarding';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { findFirstImageJob, startFirstImage } from './actions';
import { createProcessingPort } from './processing-port';

vi.mock('./actions', () => ({ startFirstImage: vi.fn(), findFirstImageJob: vi.fn() }));

const start = vi.mocked(startFirstImage);
const find = vi.mocked(findFirstImageJob);

const photo = new File(['png'], 'photo.png', { type: 'image/png' });

const codeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => (error instanceof ProcessingApiError ? error.code : error),
  );

beforeEach(() => vi.resetAllMocks());

describe('createProcessingPort', () => {
  it('sends the photo as the image field and returns the job', async () => {
    start.mockResolvedValue({ type: 'job', job: { jobId: 'job-1', status: 'running' } });

    await expect(createProcessingPort(vi.fn()).start(photo)).resolves.toEqual({
      jobId: 'job-1',
      status: 'running',
    });
    expect(start.mock.calls[0]?.[0].get('image')).toBe(photo);
  });

  it('refuses a photo over the Go limit without uploading it', async () => {
    const large = new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], 'large.png');

    await expect(codeOf(createProcessingPort(vi.fn()).start(large))).resolves.toBe(
      'image_too_large',
    );
    expect(start).not.toHaveBeenCalled();
  });

  it('turns an error response into the server code', async () => {
    find.mockResolvedValue({ type: 'error', code: 'job_not_found' });

    await expect(codeOf(createProcessingPort(vi.fn()).find('job-1'))).resolves.toBe(
      'job_not_found',
    );
  });

  it('reports network when the action call itself fails', async () => {
    find.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(codeOf(createProcessingPort(vi.fn()).find('job-1'))).resolves.toBe('network');
  });

  it('stops and tells the page when the session is gone', async () => {
    const onSignedOut = vi.fn();
    find.mockResolvedValue({ type: 'signed-out' });

    await expect(createProcessingPort(onSignedOut).find('job-1')).resolves.toBeNull();
    expect(onSignedOut).toHaveBeenCalledTimes(1);
  });
});
