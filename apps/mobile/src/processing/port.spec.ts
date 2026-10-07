import { runProcessing } from '@snapdone/onboarding';
import type { JobDetail } from '@snapdone/processing';
import { describe, expect, it, vi } from 'vitest';

import type { JobApi } from './jobApi';
import { createJobPort } from './port';

const image = { uri: 'file:///cache/photo.jpg' };
const legacy = { selection: null, outcome: null, sourceJobId: null };
const running: JobDetail = { jobId: 'job-1', status: 'running', ...legacy };
const ambiguous: JobDetail = {
  jobId: 'job-1',
  status: 'completed',
  result: { category: 'other', facts: [], suggestedAction: 'none', confidence: 'low' },
  selection: null,
  outcome: { kind: 'ambiguous', candidates: ['text', 'receipt'] },
  sourceJobId: null,
};

/** 로그인한 controller처럼 credential `c`로 부른다. signedOut이면 세션이 끝난 것처럼 `null`이다. */
const controller = (signedOut = false) => ({
  authorized: async <T>(request: (credential: string) => Promise<T | null>) =>
    signedOut ? null : request('c'),
});

const fakeApi = (finds: JobDetail[]): JobApi & { calls: string[] } => {
  const calls: string[] = [];
  return {
    calls,
    start: vi.fn(async () => {
      calls.push('start');
      return running;
    }),
    reprocess: vi.fn(async () => {
      calls.push('reprocess');
      return { ...running, jobId: 'job-2', sourceJobId: 'job-1' };
    }),
    find: vi.fn(async () => {
      calls.push('find');
      return finds.shift() ?? running;
    }),
    resolveField: vi.fn(async () => null),
  };
};

const run = (port: ReturnType<typeof createJobPort>, stopped: () => boolean = () => false) => {
  const states: unknown[] = [];
  return runProcessing(
    { ...port, wait: async () => undefined },
    image,
    (state) => states.push(state),
    stopped,
  ).then(() => states);
};

describe('createJobPort', () => {
  it('starts a new job and polls it until the server finishes it', async () => {
    const api = fakeApi([running, ambiguous]);
    const states = await run(createJobPort(controller(), api));

    expect(api.calls).toEqual(['start', 'find', 'find']);
    expect(states.at(-1)).toMatchObject({ status: 'completed', job: ambiguous });
  });

  it('continues an ambiguous job with the chosen type instead of starting a new one', async () => {
    const api = fakeApi([{ ...ambiguous, jobId: 'job-2' }]);
    await run(createJobPort(controller(), api, { sourceJobId: 'job-1', imageType: 'receipt' }));

    expect(api.calls).toEqual(['reprocess', 'find']);
    expect(api.reprocess).toHaveBeenCalledWith('c', image, {
      sourceJobId: 'job-1',
      imageType: 'receipt',
    });
  });

  it('stops without a result when the session is gone', async () => {
    const api = fakeApi([]);
    const states = await run(createJobPort(controller(true), api));

    expect(api.calls).toEqual([]);
    expect(states).toEqual([{ status: 'starting' }]);
  });

  it('does not report a late answer after the screen is gone', async () => {
    let left = false;
    const api = fakeApi([ambiguous]);
    api.find = vi.fn(async () => {
      left = true;
      return ambiguous;
    });
    const states = await run(createJobPort(controller(), api), () => left);

    expect(states).not.toContainEqual(expect.objectContaining({ status: 'completed' }));
  });

  it('reprocesses the same photo with another action', async () => {
    const api = fakeApi([{ ...ambiguous, jobId: 'job-2' }]);
    await run(createJobPort(controller(), api, { sourceJobId: 'job-1', action: 'summarize' }));

    expect(api.calls).toEqual(['reprocess', 'find']);
    expect(api.reprocess).toHaveBeenCalledWith('c', image, {
      sourceJobId: 'job-1',
      action: 'summarize',
    });
  });
});
