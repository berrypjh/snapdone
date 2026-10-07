import { describe, expect, it, vi } from 'vitest';

import type { AuthController } from '../auth/controller';

import type { HomeApi } from './homeApi';
import { loadHome } from './loadHome';

const job = {
  jobId: 'job-1',
  status: 'failed',
  createdAt: '2026-10-06T09:00:00Z',
  finishedAt: null,
  selection: null,
  outcome: null,
  sourceJobId: null,
} as const;
const preferences = { text: 'summarize', receipt: 'record_expense' } as const;

/** 로그인한 앱처럼 credential `c`로 부른다. 요청이 `null`이면 실제처럼 그대로 `null`이다. */
const authorized: AuthController['authorized'] = (request) => request('c');

const api = (overrides: Partial<HomeApi> = {}): HomeApi => ({
  recentJobs: async () => [job],
  preferences: async () => preferences,
  ...overrides,
});

describe('loadHome', () => {
  it('reads both through the authorized session', async () => {
    const seen: string[] = [];
    const home = await loadHome(
      authorized,
      api({
        recentJobs: async (credential) => {
          seen.push(credential);
          return [job];
        },
        preferences: async (credential) => {
          seen.push(credential);
          return preferences;
        },
      }),
    );

    expect(home).toEqual({
      recent: { ok: true, value: [job] },
      preferences: { ok: true, value: preferences },
    });
    expect(seen).toEqual(['c', 'c']);
  });

  it('starts both before either finishes', async () => {
    let started = 0;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const loading = loadHome(
      authorized,
      api({
        recentJobs: async () => {
          started += 1;
          await gate;
          return [];
        },
        preferences: async () => {
          started += 1;
          await gate;
          return preferences;
        },
      }),
    );

    await vi.waitFor(() => expect(started).toBe(2));
    release();
    await expect(loading).resolves.toMatchObject({ recent: { ok: true, value: [] } });
  });

  it('keeps the preferences when the jobs fail, without guessing an empty home', async () => {
    const home = await loadHome(
      authorized,
      api({ recentJobs: () => Promise.reject(new Error('500')) }),
    );

    expect(home).toEqual({ recent: { ok: false }, preferences: { ok: true, value: preferences } });
  });

  it('keeps the jobs when the preferences fail, without a default', async () => {
    const home = await loadHome(
      authorized,
      api({
        recentJobs: async () => [],
        preferences: () => Promise.reject(new TypeError('network')),
      }),
    );

    expect(home).toEqual({ recent: { ok: true, value: [] }, preferences: { ok: false } });
  });

  it('reports both failures', async () => {
    const failing = () => Promise.reject(new Error('500'));
    const home = await loadHome(authorized, api({ recentJobs: failing, preferences: failing }));

    expect(home).toEqual({ recent: { ok: false }, preferences: { ok: false } });
  });

  it.each(['recentJobs', 'preferences'] as const)(
    'is signed out when %s gets 401 (authorized has expired the session)',
    async (name) => {
      const home = await loadHome(authorized, api({ [name]: async () => null }));

      expect(home).toBeNull();
    },
  );

  it('counts an unreadable credential store as a failed read, not a sign-out', async () => {
    const broken: AuthController['authorized'] = () =>
      Promise.reject(new Error('storage_unavailable'));

    await expect(loadHome(broken, api())).resolves.toEqual({
      recent: { ok: false },
      preferences: { ok: false },
    });
  });
});
