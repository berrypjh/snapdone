import { describe, expect, it, vi } from 'vitest';

import { fetchProviderModels } from './provider-models';
import { providerVariant } from './variant-command';

const SECRET = 'sk-test-never-shown';

const reply = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

describe('provider model lists', () => {
  it('says no key without calling anyone', async () => {
    const fetcher = vi.fn();
    const lists = await fetchProviderModels({}, fetcher);

    expect(lists.map((l) => l.state)).toEqual(['no-key', 'no-key']);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('lists the newest models first and drops OpenAI models that cannot read a photo', async () => {
    const fetcher = vi.fn((url: string, _init?: RequestInit) =>
      url.includes('anthropic')
        ? reply(200, {
            data: [
              { id: 'claude-old', display_name: 'Claude Old', created_at: '2025-01-01T00:00:00Z' },
              { id: 'claude-new', display_name: 'Claude New', created_at: '2026-09-01T00:00:00Z' },
            ],
          })
        : reply(200, {
            data: [
              { id: 'gpt-6-luna', created: 1_780_000_000 },
              { id: 'text-embedding-3-small', created: 1_790_000_000 },
              { id: 'gpt-6-realtime', created: 1_790_000_000 },
              { id: 'dall-e-3', created: 1_700_000_000 },
            ],
          }),
    );
    const [anthropic, openai] = await fetchProviderModels(
      { ANTHROPIC_API_KEY: SECRET, OPENAI_API_KEY: SECRET },
      fetcher as unknown as typeof fetch,
    );

    expect(anthropic.models.map((m) => m.id)).toEqual(['claude-new', 'claude-old']);
    expect(anthropic.models[0]).toEqual({
      id: 'claude-new',
      name: 'Claude New',
      created: '2026-09-01',
    });
    expect(openai.models.map((m) => m.id)).toEqual(['gpt-6-luna']);
    // key는 요청 헤더에만 간다.
    expect(JSON.stringify(fetcher.mock.calls[0])).toContain(SECRET);
    expect(JSON.stringify([anthropic, openai])).not.toContain(SECRET);
  });

  it('keeps one provider when the other fails, with a reason that holds no key', async () => {
    const fetcher = vi.fn((url: string, _init?: RequestInit) =>
      url.includes('anthropic') ? reply(401, { error: SECRET }) : reply(200, { data: [] }),
    );
    const [anthropic, openai] = await fetchProviderModels(
      { ANTHROPIC_API_KEY: SECRET, OPENAI_API_KEY: SECRET },
      fetcher as unknown as typeof fetch,
    );

    expect(anthropic).toEqual({
      provider: 'anthropic',
      state: 'failed',
      models: [],
      reason: 'HTTP 401',
    });
    expect(openai.state).toBe('ok');
  });

  it('turns a listed model into a --variant provider:model reference', () => {
    const v = providerVariant('openai', {
      id: 'gpt-4.1-mini',
      name: 'gpt-4.1-mini',
      created: null,
    });

    expect(v).toMatchObject({
      ref: 'openai:gpt-4.1-mini',
      id: 'gpt-4-1-mini',
      apiKeyEnv: 'OPENAI_API_KEY',
    });
  });
});
