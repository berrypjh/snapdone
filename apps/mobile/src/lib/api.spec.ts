import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchHealth, getApiBaseUrl } from './api';

const BASE_URL = 'http://192.168.0.10:8080';

const jsonResponse = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('getApiBaseUrl', () => {
  it('reads EXPO_PUBLIC_API_BASE_URL', () => {
    vi.stubEnv('EXPO_PUBLIC_API_BASE_URL', BASE_URL);

    expect(getApiBaseUrl()).toBe(BASE_URL);
  });

  it('strips trailing slashes so the path is not doubled', () => {
    vi.stubEnv('EXPO_PUBLIC_API_BASE_URL', `${BASE_URL}///`);

    expect(getApiBaseUrl()).toBe(BASE_URL);
  });

  it('tells the developer to copy .env and restart Metro', () => {
    vi.stubEnv('EXPO_PUBLIC_API_BASE_URL', '');

    expect(() => getApiBaseUrl()).toThrow(/--clear/);
  });
});

describe('fetchHealth', () => {
  it('calls /health on the configured base URL', async () => {
    vi.stubEnv('EXPO_PUBLIC_API_BASE_URL', BASE_URL);
    const fetchMock = vi.fn(async () => jsonResponse({ status: 'ok' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchHealth()).resolves.toEqual({ status: 'ok' });
    expect(fetchMock).toHaveBeenCalledWith(`${BASE_URL}/health`);
  });

  it('reports the status code when the response is not ok', async () => {
    vi.stubEnv('EXPO_PUBLIC_API_BASE_URL', BASE_URL);
    vi.stubGlobal('fetch', async () => new Response('nope', { status: 503 }));

    await expect(fetchHealth()).rejects.toThrow(/503/);
  });

  it('rejects a body that does not match the expected shape', async () => {
    vi.stubEnv('EXPO_PUBLIC_API_BASE_URL', BASE_URL);
    vi.stubGlobal('fetch', async () => jsonResponse({ ok: true }));

    await expect(fetchHealth()).rejects.toThrow(/형식/);
  });
});
