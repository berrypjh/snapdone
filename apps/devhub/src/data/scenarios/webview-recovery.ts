import type { Scenario } from '../../domain/model';

import { step } from './step';

const SCREEN = 'apps/mobile/src/screens/WebContentScreen.tsx';
const APP_HANDOFF = 'apps/mobile/src/auth/webHandoff.ts';

export const webViewRecovery: Scenario = {
  id: 'webview-recovery',
  title: 'WebView 로드 · 핸드오프 복구',
  goal: '앱 안 web 화면이 열리지 않거나 로그인 전달이 실패해도 다시 시도 가능',
  track: 'current',
  status: 'implemented',
  docs: [{ document: 'target-architecture', heading: '런타임 계약' }],
  gaps: [{ kind: 'runtime-unverified', note: '앱 쪽 오류 화면은 단위 테스트까지' }],
  steps: [
    step({
      id: 'load-failure',
      intent: 'web 화면이 네트워크 · HTTP 오류로 열리지 않음',
      behavior: '"화면을 불러오지 못했습니다"와 "다시 시도" 표시, 누르면 같은 주소를 다시 불러옴',
      runtime: 'mobile-app',
      owner: 'mobile',
      status: 'implemented',
      source: [
        { path: SCREEN, symbol: 'FAILURE_COPY' },
        { path: APP_HANDOFF, symbol: 'retryAfterFailure' },
      ],
      gaps: [
        {
          kind: 'no-test',
          note: '로드 실패 뒤 재시도(failure: load) 분기를 직접 검사하는 테스트 없음. 핸드오프 실패 재시도만 테스트',
        },
      ],
    }),
    step({
      id: 'auth-required',
      intent: '(자동) web이 이 WebView에 세션이 없다고 알림',
      behavior: '앱이 자기 세션을 서버에 다시 확인하고, 유효하면 핸드오프를 한 번 더 시작',
      runtime: 'mobile-app',
      owner: 'mobile',
      status: 'implemented',
      source: [
        { path: APP_HANDOFF, symbol: 'receiveMessage' },
        { path: APP_HANDOFF, symbol: 'retryHandoff' },
        { path: 'apps/mobile/src/auth/controller.ts', symbol: 'revalidate' },
      ],
      contracts: ['bridge-auth-required'],
      tests: [
        'mobile-webcontent-auth-required',
        'web-handoff-refused',
        'e2e-inapp-login',
        'e2e-inapp-no-verifier',
      ],
      next: ['handoff-failure', 'session-expired'],
    }),
    step({
      id: 'handoff-failure',
      intent: '로그인 전달이 계속 실패',
      behavior:
        '핸드오프는 화면당 최대 2번. 넘기면 "로그인 정보를 전달하지 못했습니다"와 "다시 시도" 표시, 다시 시도는 횟수를 새로 셈',
      runtime: 'mobile-app',
      owner: 'mobile',
      status: 'implemented',
      source: [
        { path: APP_HANDOFF, symbol: 'MAX_HANDOFFS' },
        { path: APP_HANDOFF, symbol: 'retryAfterFailure' },
        { path: SCREEN, symbol: 'FAILURE_COPY' },
      ],
      tests: ['mobile-webcontent-retry-limit', 'mobile-webcontent-retry-after-failure'],
    }),
    step({
      id: 'session-expired',
      intent: '앱 로그인도 이미 만료',
      behavior: 'credential을 지우고 로그인 만료로 바꿔 로그인 화면 표시. WebView 화면은 닫힘',
      runtime: 'mobile-app',
      owner: 'mobile',
      status: 'implemented',
      source: [
        { path: 'apps/mobile/src/auth/controller.ts', symbol: 'startHandoff' },
        { path: 'apps/mobile/src/auth/model.ts', symbol: 'authReducer' },
      ],
      tests: ['mobile-start-handoff-expired', 'mobile-revalidate-401'],
    }),
  ],
};
