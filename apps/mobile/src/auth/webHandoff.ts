import type { WebToAppMessage } from '@snapdone/webview-bridge';

import { handoffExchangeUrl, handoffStartUrl, isWebPage, webUrl } from '../lib/web';

/** 한 WebView 화면이 시작할 수 있는 핸드오프 수: 처음 한 번 + `auth-required` 뒤 재시도 한 번. */
export const MAX_HANDOFFS = 2;

export type WebContent = {
  /** 사용자가 열려는 web 경로. */
  path: string;
  uri: string;
  /** 같은 uri를 다시 불러오려고 올린다. */
  attempt: number;
  /** 핸드오프를 시작한 뒤 첫 `handoff-ready`만 받는다. */
  awaitingReady: boolean;
  handoffs: number;
  failure: 'load' | 'handoff' | null;
};

export type WebContentEffect =
  | { type: 'none' }
  | { type: 'title'; title: string }
  | { type: 'start-handoff'; challenge: string }
  | { type: 'revalidate' };

type Decision = { next: WebContent; effect: WebContentEffect };

/** 이 앱 실행에서 WebView에 넘긴 로그인. 다른 로그인이면 WebView의 이전 cookie를 핸드오프로 교체한다. */
export const createHandoffMemory = () => {
  let handedOff: string | null = null;
  return {
    needs: (key: string) => handedOff !== key,
    remember: (key: string) => {
      handedOff = key;
    },
  };
};

export type HandoffMemory = ReturnType<typeof createHandoffMemory>;

export const handoffKey = (generation: number, userId: string) => `${generation}:${userId}`;

const startHandoff = (state: WebContent): WebContent =>
  state.handoffs >= MAX_HANDOFFS
    ? { ...state, awaitingReady: false, failure: 'handoff' }
    : {
        ...state,
        uri: handoffStartUrl(state.path),
        attempt: state.attempt + 1,
        awaitingReady: true,
        handoffs: state.handoffs + 1,
        failure: null,
      };

export const initialWebContent = (path: string, needsHandoff: boolean): WebContent => {
  const idle: WebContent = {
    path,
    uri: webUrl(path),
    attempt: 0,
    awaitingReady: false,
    handoffs: 0,
    failure: null,
  };
  return needsHandoff ? { ...startHandoff(idle), attempt: 0 } : idle;
};

/** 보낸 page의 origin과 대기 상태로 메시지를 받을지 정한다. Android는 `pageUrl`로 origin만 줘 경로는 보지 않는다. */
export const receiveMessage = (
  state: WebContent,
  message: WebToAppMessage,
  pageUrl: string,
): Decision => {
  const ignore: Decision = { next: state, effect: { type: 'none' } };
  if (!isWebPage(pageUrl)) return ignore;

  switch (message.type) {
    case 'ready':
      return { next: state, effect: { type: 'title', title: message.title } };
    case 'handoff-ready':
      if (!state.awaitingReady || message.next !== state.path) {
        return ignore;
      }
      return {
        next: { ...state, awaitingReady: false },
        effect: { type: 'start-handoff', challenge: message.challenge },
      };
    case 'auth-required':
      return { next: { ...state, awaitingReady: false }, effect: { type: 'revalidate' } };
  }
};

/** 앱 세션이 아직 유효할 때 `auth-required` 뒤에 부른다. 한도를 넘으면 실패로 둔다. */
export const retryHandoff = startHandoff;

/** Go가 발급한 code로 web 서버 교환 주소를 연다. */
export const openExchange = (state: WebContent, code: string): WebContent => ({
  ...state,
  uri: handoffExchangeUrl(code, state.path),
  attempt: state.attempt + 1,
});

/** 사용자가 실패 화면에서 다시 시도한다. 핸드오프 한도를 새로 센다. */
export const retryAfterFailure = (state: WebContent): WebContent =>
  state.failure === 'handoff'
    ? startHandoff({ ...state, handoffs: 0 })
    : { ...state, failure: null, attempt: state.attempt + 1 };

/** 보고 있는 탭을 다시 누르면 처음 page로. 핸드오프 중 · 실패 화면이면 그대로. */
export const reopenStart = (state: WebContent): WebContent =>
  state.awaitingReady || state.failure
    ? state
    : { ...state, uri: webUrl(state.path), attempt: state.attempt + 1 };
