import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createHandoffMemory,
  handoffKey,
  initialWebContent,
  openExchange,
  receiveMessage,
  retryAfterFailure,
  retryHandoff,
} from './webHandoff';

const BASE_URL = 'http://192.168.0.10:3000';
const CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
const READY_URL = `${BASE_URL}/auth/handoff/ready?next=%2Fhistory`;
const handoffReady = { type: 'handoff-ready', challenge: CHALLENGE, next: '/history' } as const;

beforeEach(() => {
  vi.stubEnv('EXPO_PUBLIC_WEB_BASE_URL', BASE_URL);
});

describe('initialWebContent', () => {
  it('starts with a handoff for a login this WebView has not received', () => {
    expect(initialWebContent('/history', true)).toMatchObject({
      uri: `${BASE_URL}/auth/handoff/start?next=%2Fhistory`,
      awaitingReady: true,
      handoffs: 1,
    });
  });

  it('opens the page directly when this login was already handed off', () => {
    expect(initialWebContent('/history', false)).toMatchObject({
      uri: `${BASE_URL}/history`,
      awaitingReady: false,
      handoffs: 0,
    });
  });
});

describe('handoff memory', () => {
  it('asks for a new handoff after logout or for another user', () => {
    const memory = createHandoffMemory();
    memory.remember(handoffKey(0, 'user-a'));

    expect(memory.needs(handoffKey(0, 'user-a'))).toBe(false);
    expect(memory.needs(handoffKey(1, 'user-a'))).toBe(true);
    expect(memory.needs(handoffKey(1, 'user-b'))).toBe(true);
  });
});

describe('receiveMessage', () => {
  const waiting = () => initialWebContent('/history', true);

  it('starts the handoff once for the ready page it opened', () => {
    const first = receiveMessage(waiting(), handoffReady, READY_URL);

    expect(first.effect).toEqual({ type: 'start-handoff', challenge: CHALLENGE });
    expect(receiveMessage(first.next, handoffReady, READY_URL).effect).toEqual({ type: 'none' });
  });

  it.each([
    ['another origin', 'https://evil.example/auth/handoff/ready', handoffReady],
    ['another page', `${BASE_URL}/history`, handoffReady],
    ['another next', READY_URL, { ...handoffReady, next: '/' }],
  ] as const)('ignores handoff-ready from %s', (_, url, message) => {
    expect(receiveMessage(waiting(), message, url).effect).toEqual({ type: 'none' });
  });

  it('ignores handoff-ready it did not ask for', () => {
    expect(
      receiveMessage(initialWebContent('/history', false), handoffReady, READY_URL).effect,
    ).toEqual({ type: 'none' });
  });

  it('passes the title of a web page', () => {
    expect(
      receiveMessage(waiting(), { type: 'ready', title: '기록' }, `${BASE_URL}/history`).effect,
    ).toEqual({ type: 'title', title: '기록' });
  });

  it('ignores any message from a page outside the web origin', () => {
    const effect = receiveMessage(
      waiting(),
      { type: 'auth-required' },
      'https://evil.example/login',
    ).effect;

    expect(effect).toEqual({ type: 'none' });
  });

  it('revalidates the app session when the web asks for login', () => {
    const decision = receiveMessage(waiting(), { type: 'auth-required' }, `${BASE_URL}/login`);

    expect(decision.effect).toEqual({ type: 'revalidate' });
    expect(decision.next.awaitingReady).toBe(false);
  });
});

describe('retries', () => {
  it('hands off again only once, then fails', () => {
    const first = initialWebContent('/history', true);
    const second = retryHandoff(first);
    const third = retryHandoff(second);

    expect(second).toMatchObject({ handoffs: 2, awaitingReady: true, attempt: 1 });
    expect(third).toMatchObject({ failure: 'handoff', awaitingReady: false });
  });

  it('allows two handoffs when the page was opened without one', () => {
    const lazy = retryHandoff(initialWebContent('/history', false));

    expect(retryHandoff(lazy).failure).toBeNull();
    expect(retryHandoff(retryHandoff(lazy)).failure).toBe('handoff');
  });

  it('opens the exchange URL with the code and the same path', () => {
    expect(openExchange(initialWebContent('/history', true), 'code-1').uri).toBe(
      `${BASE_URL}/auth/handoff?code=code-1&next=%2Fhistory`,
    );
  });

  it('starts over when the user retries after a failed handoff', () => {
    const failed = retryHandoff(retryHandoff(initialWebContent('/history', true)));

    expect(retryAfterFailure(failed)).toMatchObject({ failure: null, handoffs: 1 });
  });
});
