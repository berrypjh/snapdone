import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchHealth, getApiBaseUrl } from './api';

const BASE_URL = 'http://localhost:8080';

const jsonResponse = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('getApiBaseUrl', () => {
  it('reads API_BASE_URL', () => {
    vi.stubEnv('API_BASE_URL', BASE_URL);

    expect(getApiBaseUrl()).toBe(BASE_URL);
  });

  it('strips trailing slashes so the path is not doubled', () => {
    vi.stubEnv('API_BASE_URL', `${BASE_URL}///`);

    expect(getApiBaseUrl()).toBe(BASE_URL);
  });

  it('names the file to copy when the variable is missing', () => {
    vi.stubEnv('API_BASE_URL', '');

    expect(() => getApiBaseUrl()).toThrow(/\.env\.example/);
  });
});

describe('fetchHealth', () => {
  it('calls /health on the configured base URL', async () => {
    vi.stubEnv('API_BASE_URL', BASE_URL);
    const fetchMock = vi.fn(async () => jsonResponse({ status: 'ok' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchHealth()).resolves.toEqual({ status: 'ok' });
    expect(fetchMock).toHaveBeenCalledWith(`${BASE_URL}/health`, {
      cache: 'no-store',
    });
  });

  it('reports the status code when the response is not ok', async () => {
    vi.stubEnv('API_BASE_URL', BASE_URL);
    vi.stubGlobal('fetch', async () => new Response('nope', { status: 503 }));

    await expect(fetchHealth()).rejects.toThrow(/503/);
  });

  it('rejects a body that does not match the expected shape', async () => {
    vi.stubEnv('API_BASE_URL', BASE_URL);
    vi.stubGlobal('fetch', async () => jsonResponse({ ok: true }));

    await expect(fetchHealth()).rejects.toThrow(/형식/);
  });
});
