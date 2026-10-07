import type { Scenario } from '../../domain/model';

import { step } from './step';

const APP = 'apps/mobile/src/app/App.tsx';
const CONTROLLER = 'apps/mobile/src/auth/controller.ts';

export const appEntrySessionRestore: Scenario = {
  id: 'app-entry-session-restore',
  title: '앱 진입 · 세션 복원',
  goal: '앱이나 사이트를 열면 첫 화면 표시, 앱은 저장된 로그인으로 이어지고 서버가 거부한 로그인은 정리',
  track: 'current',
  status: 'implemented',
  docs: [{ document: 'target-architecture', heading: '`apps/mobile` — React Native + Expo' }],
  gaps: [
    {
      kind: 'runtime-unverified',
      note: 'mobile은 시뮬레이터 · Detox · Maestro가 없어 단위 테스트까지만 검증',
    },
  ],
  steps: [
    step({
      id: 'launch',
      intent: '앱 열기',
      behavior:
        '복원 화면을 띄우고 인증 controller가 저장된 로그인 복원과 로그인 수단 조회를 함께 시작',
      runtime: 'mobile-app',
      owner: 'mobile',
      status: 'implemented',
      source: [
        { path: APP, symbol: 'AppNavigator' },
        { path: APP, symbol: 'createAppAuthController' },
        { path: 'apps/mobile/src/components/auth/AuthRestoring.tsx', symbol: 'AuthRestoring' },
        { path: CONTROLLER, symbol: 'createAuthController' },
      ],
      apis: ['get-auth-capabilities'],
      tests: ['mobile-restore-anonymous'],
      next: ['read-credential'],
    }),
    step({
      id: 'read-credential',
      intent: '(자동) 이 기기에 저장된 로그인 정보 읽기',
      behavior:
        'SecureStore에서 credential 읽기. 없으면 로그인 화면, 읽지 못하면 재시도 화면으로 이동',
      runtime: 'mobile-app',
      owner: 'mobile',
      status: 'implemented',
      source: [
        { path: 'apps/mobile/src/auth/device.ts', symbol: 'secureAuthStorage' },
        { path: CONTROLLER, symbol: 'createAuthController' },
      ],
      tests: ['mobile-restore-anonymous', 'mobile-restore-storage'],
      next: ['check-session', 'choose-screen', 'restore-failed'],
    }),
    step({
      id: 'check-session',
      intent: '(자동) 저장된 로그인이 아직 유효한지 서버에 확인',
      behavior: 'Bearer credential로 세션 조회. 401이면 credential을 지우고 로그아웃 상태로 전환',
      runtime: 'go-api',
      owner: 'api',
      status: 'implemented',
      source: [
        { path: 'apps/mobile/src/auth/api.ts', symbol: 'authApi' },
        { path: 'apps/api/internal/httpserver/auth.go', symbol: 'handlers.session' },
        { path: 'apps/api/internal/auth/session.go', symbol: 'Store.FindSession' },
      ],
      apis: ['get-auth-session'],
      contracts: ['auth-session'],
      tests: [
        'mobile-restore-accepted',
        'mobile-restore-rejected',
        'go-session-public-fields',
        'go-session-rejects-unknown',
        'go-session-expired',
      ],
      docs: [{ document: 'data-access', heading: 'Mobile은 항상 직접 호출한다' }],
      next: ['choose-screen', 'restore-failed'],
    }),
    step({
      id: 'restore-failed',
      intent: '서버나 기기 저장소에 닿지 못했을 때 다시 시도',
      behavior: 'credential을 지우지 않고 이유와 "다시 시도" 표시. 로그인 화면으로 보내지 않음',
      runtime: 'mobile-app',
      owner: 'mobile',
      status: 'implemented',
      source: [
        {
          path: 'apps/mobile/src/components/auth/AuthRestoreFailed.tsx',
          symbol: 'AuthRestoreFailed',
        },
        { path: 'apps/mobile/src/components/auth/authCopy.ts', symbol: 'restoreFailedMessage' },
        { path: 'apps/mobile/src/auth/model.ts', symbol: 'authReducer' },
      ],
      tests: ['mobile-restore-unreachable', 'mobile-restore-retry', 'mobile-restore-failed-state'],
      next: ['read-credential'],
    }),
    step({
      id: 'choose-screen',
      intent: '(자동) 로그인 상태에 맞는 첫 화면 보기',
      behavior: '로그아웃이면 로그인, 온보딩 전이면 소개, 온보딩을 마쳤으면 홈 등록',
      runtime: 'mobile-app',
      owner: 'mobile',
      status: 'implemented',
      source: [
        { path: 'apps/mobile/src/auth/model.ts', symbol: 'destinationFor' },
        { path: APP, symbol: 'AppNavigator' },
      ],
      tests: ['mobile-destination-onboarding', 'mobile-destination-home'],
      next: ['revalidate'],
    }),
    step({
      id: 'revalidate',
      intent: '다른 앱을 쓰다 복귀',
      behavior:
        '앱이 foreground가 될 때마다 세션 재확인. 401이면 만료 처리, 오프라인이면 로그인 유지',
      runtime: 'mobile-app',
      owner: 'mobile',
      status: 'implemented',
      source: [
        { path: APP, symbol: 'AppState' },
        { path: CONTROLLER, symbol: 'revalidate' },
      ],
      apis: ['get-auth-session'],
      tests: ['mobile-revalidate-401', 'mobile-revalidate-offline'],
    }),
    step({
      id: 'web-home',
      intent: '브라우저에서 사이트(/) 열기',
      behavior:
        '/는 보호 page. requireSession 뒤 처리 기록(GET /v1/processing-jobs)과 처리 방식을 함께 읽어 온보딩 뒤 처리한 사진이 없으면 빈 홈, 있으면 최근 처리 홈. 확인이 필요한 영수증 값이 있는 처리는 따로 모으고, 항목을 누르면 그 처리 결과로 감. 기록을 읽지 못하면 비었다고 추측하지 않음',
      runtime: 'next-server',
      owner: 'web',
      status: 'implemented',
      source: [
        { path: 'apps/web/src/app/(product)/page.tsx', symbol: 'HomePage' },
        { path: 'apps/web/src/lib/home/home.ts', symbol: 'loadHome' },
        { path: 'apps/web/src/app/(product)/layout.tsx', symbol: 'ProductLayout' },
        { path: 'apps/web/src/lib/auth/session.ts', symbol: 'requireSession' },
      ],
      apis: ['get-processing-jobs', 'get-processing-preferences'],
      contracts: ['processing-recent-job', 'processing-preferences'],
      tests: ['e2e-home', 'e2e-home-active', 'e2e-home-flow-active', 'processing-recent-unread'],
    }),
  ],
};
