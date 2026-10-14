import type { RecordRef } from '../domain/model';

/**
 * 개발 기록. 항목마다 `docs/records/` 아래 markdown 파일 하나다.
 * 기록은 무엇을 언제 왜 결정하거나 고쳤는지 말하고, 지금 무엇이 참인지는 설계 문서가 말한다.
 */
export const records: RecordRef[] = [
  {
    id: 'expo-fetch-photo-upload',
    path: 'docs/records/2026-10-09-expo-fetch-photo-upload.md',
    title: 'Expo fetch가 RN식 파일 항목을 받지 않아 앱 사진 업로드가 실패하던 문제 수정',
    kind: 'fix',
    date: '2026-10-09',
    summary:
      'Expo SDK 56은 전역 fetch를 `expo/fetch`로 바꾸고, 이 구현은 `{ uri }` 파일 항목을 받지 않음. `expo-file-system`의 `File`로 담음. 원인은 EAS Update로 보낸 진단 로그로 확인',
    sources: [
      { path: 'apps/mobile/src/lib/photoForm.ts', symbol: 'photoForm' },
      { path: 'apps/mobile/src/processing/jobApi.ts', symbol: 'jobApi' },
      { path: 'apps/mobile/src/onboarding/processingApi.ts', symbol: 'processingApi' },
      { path: 'apps/mobile/vitest.setup.ts' },
    ],
    docs: [{ document: 'deployment', heading: 'JS만 바꿨을 때 — EAS Update' }],
    tests: ['mobile-photo-form-file'],
  },
  {
    id: 'eas-update',
    path: 'docs/records/2026-10-09-eas-update.md',
    title: 'mobile에 EAS Update 추가 — runtimeVersion은 appVersion',
    kind: 'decision',
    date: '2026-10-09',
    summary:
      'JS만 바뀐 변경은 설치된 APK로 보냄. 네이티브가 바뀌면 `version`을 올리고 다시 빌드. fingerprint는 모노레포에서 어긋날 수 있어 미사용',
    sources: [{ path: 'apps/mobile/app.json' }, { path: 'apps/mobile/eas.json' }],
    docs: [{ document: 'deployment', heading: 'JS만 바꿨을 때 — EAS Update' }],
    tests: [],
  },
  {
    id: 'android-webview-top-frame',
    path: 'docs/records/2026-10-09-android-webview-top-frame.md',
    title: 'Android가 isTopFrame을 주지 않아 처리 결과 링크를 가로채지 못함',
    kind: 'fix',
    date: '2026-10-09',
    summary:
      'Android 이동 가로채기 이벤트에는 `isTopFrame`이 없음. 없으면 최상위로 보고, 보고 있는 탭을 다시 누르면 처음 page로',
    sources: [
      { path: 'apps/mobile/src/lib/web.ts', symbol: 'isTopFrameRequest' },
      { path: 'apps/mobile/src/auth/webHandoff.ts', symbol: 'reopenStart' },
      { path: 'apps/mobile/src/app/MainTabs.tsx', symbol: 'MainTabs' },
    ],
    docs: [{ document: 'target-architecture', heading: '제품 구성 — 네이티브 셸 + 웹 콘텐츠' }],
    tests: [
      'mobile-webview-top-frame',
      'mobile-webcontent-reopen-start',
      'mobile-webcontent-reopen-keeps',
    ],
  },
  {
    id: 'exact-react-version-pins',
    path: 'docs/records/2026-09-16-exact-react-version-pins.md',
    title: 'React와 react-native 버전은 `^` 없이 정확히 고정',
    kind: 'decision',
    date: '2026-09-16',
    summary: '렌더러가 특정 React로 빌드돼 있어 캐럿 범위 사용 불가. 웹 감각이 통하지 않는 자리',
    sources: [
      { path: 'package.json' },
      { path: 'apps/mobile/package.json' },
      { path: 'apps/web/package.json' },
    ],
    docs: [{ document: 'target-architecture', heading: '버전 정책' }],
    tests: [],
  },
  {
    id: 'onboarding-intro-accessibility',
    path: 'docs/records/2026-09-19-onboarding-intro-accessibility.md',
    title: '온보딩 소개 화면을 스크린 리더가 완료로 읽도록 수정',
    kind: 'fix',
    date: '2026-09-19',
    summary: '보이는 문구와 읽히는 문구를 분리하고, 카드 하나를 한 번에 읽도록 조정',
    sources: [
      {
        path: 'apps/mobile/src/screens/OnboardingIntroScreen.tsx',
        symbol: 'OnboardingIntroScreen',
      },
    ],
    docs: [{ document: 'product-principles', heading: '성공 화면의 정의' }],
    tests: [],
  },
  {
    id: 'nx-loads-api-dotenv',
    path: 'docs/records/2026-09-18-nx-loads-api-dotenv.md',
    title: 'Nx가 apps/api/.env를 읽어 config 테스트 실패',
    kind: 'fix',
    date: '2026-09-18',
    summary: 'Go는 .env를 읽지 않지만 Nx가 대신 읽는다. 같은 테스트가 실행 경로에 따라 갈림',
    sources: [
      { path: 'apps/api/internal/config/config.go' },
      { path: 'apps/api/internal/config/config_test.go' },
      { path: 'apps/api/.env.example' },
    ],
    docs: [{ document: 'local-development' }, { document: 'quality-gates' }],
    tests: [],
  },
  {
    id: 'webview-login-handoff',
    path: 'docs/records/2026-09-16-webview-login-handoff.md',
    title: 'WebView 로그인은 일회용 코드로 전달 — 토큰은 넘기지 않음',
    kind: 'decision',
    date: '2026-09-16',
    summary: '30초 일회용 코드를 교환해 web 서버가 자기 세션 쿠키를 심는 방식',
    sources: [
      { path: 'apps/api/internal/auth/handoff.go' },
      { path: 'apps/api/internal/httpserver/handoff.go' },
      { path: 'apps/web/src/lib/auth/handoff.ts' },
      { path: 'libs/webview-bridge/src/lib/bridge.ts' },
    ],
    docs: [{ document: 'data-access' }],
    tests: [
      'go-handoff-proof',
      'go-handoff-child-session',
      'web-handoff-no-verifier',
      'e2e-handoff-once',
      'e2e-inapp-other-browser',
    ],
  },
  {
    id: 'native-shell-web-content',
    path: 'docs/records/2026-09-15-native-shell-web-content.md',
    title: '네이티브 셸 + 웹 콘텐츠로 제품 분할',
    kind: 'decision',
    date: '2026-09-15',
    summary: '핵심 흐름과 로그인은 네이티브, 읽는 화면은 web 한 벌을 브라우저와 WebView가 공유',
    sources: [
      { path: 'eslint.config.mjs' },
      { path: 'libs/webview-bridge/src/lib/bridge.ts' },
      { path: 'apps/mobile/src/screens/WebContentScreen.tsx' },
    ],
    docs: [{ document: 'target-architecture' }, { document: 'product-principles' }],
    tests: ['bridge-user-agent', 'mobile-webcontent-foreign-origin', 'e2e-web-onboarding-flow'],
  },
  {
    id: 'web-calls-api-from-server',
    path: 'docs/records/2026-08-16-web-calls-api-from-server.md',
    title: '브라우저는 Go API를 직접 호출하지 않음',
    kind: 'decision',
    date: '2026-08-16',
    summary: 'web은 서버에서만 API를 호출. 그래서 CORS 설정이 저장소에 하나도 없음',
    sources: [
      { path: 'apps/web/src/lib/api.ts' },
      { path: 'apps/web/src/lib/auth/actions.ts' },
      { path: 'apps/web/next.config.js' },
    ],
    docs: [{ document: 'data-access' }],
    tests: ['web-processing-upload', 'web-processing-too-large'],
  },
];
