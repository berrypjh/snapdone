import { describe, expect, it, vi } from 'vitest';

import {
  failureOf,
  parseJob,
  ProcessingApiError,
  type ProcessingJob,
  type ProcessingPort,
  type ProcessingResult,
  type ProcessingState,
  readJobResponse,
  runProcessing,
} from './processing';

const image = { uri: 'file:///cache/photo.jpg' };

const result: ProcessingResult = {
  category: 'event',
  facts: [{ label: '날짜', value: '8월 20일 19시' }],
  suggestedAction: 'add_to_calendar',
  confidence: 'high',
};

const running: ProcessingJob = { jobId: 'job-1', status: 'running' };
const completed: ProcessingJob = { jobId: 'job-1', status: 'completed', result };

/** find는 answers를 차례로 돌려준다. */
const port = (
  start: () => Promise<ProcessingJob | null>,
  answers: (() => Promise<ProcessingJob | null>)[] = [],
): ProcessingPort<typeof image> & { find: ReturnType<typeof vi.fn> } => {
  const find = vi.fn(() => (answers.shift() ?? (() => Promise.resolve(completed)))());
  return { start, find, wait: async () => undefined };
};

const run = async (
  processingPort: ProcessingPort<typeof image>,
  stopped: () => boolean = () => false,
) => {
  const states: ProcessingState[] = [];
  await runProcessing(processingPort, image, (state) => states.push(state), stopped);
  return states;
};

describe('runProcessing', () => {
  it('polls a running job until it completes', async () => {
    const states = await run(
      port(async () => running, [async () => running, async () => completed]),
    );

    expect(states).toEqual([
      { status: 'starting' },
      { status: 'running', jobId: 'job-1' },
      { status: 'running', jobId: 'job-1' },
      { status: 'completed', jobId: 'job-1', result },
    ]);
  });

  it('ends with the server failure', async () => {
    const states = await run(
      port(async () => running, [async () => ({ jobId: 'job-1', status: 'failed' })]),
    );

    expect(states.at(-1)).toEqual({ status: 'failed', reason: 'failed' });
  });

  it('turns a rejected upload into a reason the user can act on', async () => {
    const tooLarge = await run(
      port(() => Promise.reject(new ProcessingApiError('image_too_large'))),
    );
    const unsupported = await run(
      port(() => Promise.reject(new ProcessingApiError('unsupported_image'))),
    );

    expect(tooLarge.at(-1)).toEqual({ status: 'failed', reason: 'too-large' });
    expect(unsupported.at(-1)).toEqual({ status: 'failed', reason: 'unsupported' });
  });

  it('stops with network when a poll cannot reach the server', async () => {
    const states = await run(
      port(async () => running, [() => Promise.reject(new ProcessingApiError('network'))]),
    );

    expect(states.at(-1)).toEqual({ status: 'failed', reason: 'network' });
  });

  it('stops quietly when the session is gone', async () => {
    const states = await run(port(async () => running, [async () => null]));

    expect(states).toEqual([{ status: 'starting' }, { status: 'running', jobId: 'job-1' }]);
  });

  it('neither reports nor polls after the screen stops it', async () => {
    let stop = false;
    const processingPort = port(async () => running);
    processingPort.wait = async () => {
      stop = true;
    };

    const states = await run(processingPort, () => stop);

    expect(states).toEqual([{ status: 'starting' }, { status: 'running', jobId: 'job-1' }]);
    expect(processingPort.find).not.toHaveBeenCalled();
  });

  it('reports completed once and nothing after it', async () => {
    const states = await run(port(async () => completed));

    expect(states).toEqual([
      { status: 'starting' },
      { status: 'completed', jobId: 'job-1', result },
    ]);
  });
});

describe('failureOf', () => {
  it('maps unknown errors to a plain failure', () => {
    expect(failureOf(new Error('boom'))).toBe('failed');
    expect(failureOf(new ProcessingApiError('provider_unavailable'))).toBe('failed');
    expect(failureOf(new ProcessingApiError('job_not_found'))).toBe('failed');
  });
});

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

describe('parseJob', () => {
  it('drops fields it does not know', () => {
    expect(
      parseJob({ ...completedBody, extra: 1, result: { ...completedBody.result, score: 0.9 } }),
    ).toEqual(completedBody);
  });

  it.each([
    ['a missing job id', { status: 'running' }],
    ['an unknown status', { jobId: 'job-1', status: 'queued' }],
    ['a completed job without a result', { jobId: 'job-1', status: 'completed' }],
    [
      'an unknown category',
      { ...completedBody, result: { ...completedBody.result, category: 'x' } },
    ],
    [
      'a numeric confidence',
      { ...completedBody, result: { ...completedBody.result, confidence: 0.9 } },
    ],
    [
      'a malformed fact',
      { ...completedBody, result: { ...completedBody.result, facts: [{ label: 1 }] } },
    ],
  ])('rejects %s', (_name, body) => {
    expect(parseJob(body)).toBeNull();
  });
});

describe('readJobResponse', () => {
  const codeOf = (read: () => unknown) => {
    try {
      read();
      return null;
    } catch (error) {
      return error instanceof ProcessingApiError ? error.code : error;
    }
  };

  it('reads a job from a successful response', () => {
    expect(
      readJobResponse({ ok: true, status: 202 }, { jobId: 'job-1', status: 'running' }),
    ).toEqual({ jobId: 'job-1', status: 'running' });
  });

  it('returns null when the server no longer accepts the session', () => {
    expect(readJobResponse({ ok: false, status: 401 }, { error: 'session_expired' })).toBeNull();
  });

  it('keeps the server error code, or unknown without one', () => {
    expect(
      codeOf(() => readJobResponse({ ok: false, status: 413 }, { error: 'image_too_large' })),
    ).toBe('image_too_large');
    expect(codeOf(() => readJobResponse({ ok: false, status: 502 }, null))).toBe('unknown');
  });

  it('rejects a successful response it cannot read', () => {
    expect(
      codeOf(() => readJobResponse({ ok: true, status: 200 }, { jobId: 'job-1', status: 'done' })),
    ).toBe('unknown');
  });
});
