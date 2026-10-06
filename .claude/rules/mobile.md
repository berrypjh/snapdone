---
paths:
  - 'apps/mobile/**'
---

# mobile (`apps/mobile`)

Expo managed + React Native. 진입점은 `index.js` → `src/app/App.tsx`.

## 깨지기 쉬운 제약

이 앱에는 런타임 검증 수단이 없다(시뮬레이터 · Detox · Maestro 모두 없음). 아래는 lint와 typecheck에 걸리지 않고 실제 기기에서만 드러나는 것들이다.

- **Expo는 SDK 56에 고정한다.** `@nx/expo`가 57을 생성 · 마이그레이션하지 못한다 (nrwl/nx#36443)
- **`process.env.EXPO_PUBLIC_*`는 직접 프로퍼티 접근으로만 쓴다.** Expo가 빌드 시 이 표현식을 그대로 치환하므로 `process.env[key]` 같은 동적 접근은 실제 빌드에서 `undefined`가 된다
- **패키지를 추가할 때 루트 `package.json`에 실제 버전을, `apps/mobile/package.json`에는 `"*"`를 적는다.** 루트에 빠뜨리면 `"*"`가 레지스트리 최신 버전으로 풀려 SDK와 어긋난다. 버전은 `node -e "console.log(require('expo/bundledNativeModules.json')['패키지명'])"`로 확인한다
- **사본이 갈리면 안 되는 패키지는 `pnpm-workspace.yaml`의 `overrides`로 못박는다** — `react` · `react-dom` · `react-native` · `react-native-svg` · `@berrypjh/react-native-ui`. 두 벌이 섞이면 `Cannot read property 'default' of undefined` 런타임 오류가 난다. 앱 코드가 import하는 공용 패키지는 앱에 직접 선언한다
- `build` target은 로컬 빌드가 아니라 **EAS 클라우드 빌드**다. 로컬 번들은 `nx export mobile`
- `nx run-android` · `nx run-ios`가 만드는 `apps/mobile/android/` · `ios/`는 `app.json`에서 생성되는 산출물이라 git에서 제외했다. 네이티브 설정은 이 폴더가 아니라 `app.json` · config plugin에서 바꾼다(다시 생성하면 직접 고친 내용이 사라진다)
- **`apps/mobile/package.json`의 `nx.targets.start.continuous: false`를 지우지 않는다.** 지우면 Nx가 단일 continuous 태스크에 PTY를 주지 않아 `expo start`가 QR · 키 입력 없이 뜬다 ([local-development.md](../../docs/development/local-development.md))

## 구조

- 파일 이름은 **PascalCase**(`AppShell.tsx`). web의 kebab-case와 다르다
- **navigation은 React Navigation native stack이다** (`src/app/App.tsx`, 화면 타입은 `src/app/navigation.ts`). Expo Router는 `@nx/expo` 생성기가 지원하지 않는다 (nrwl/nx#36442). 화면은 `src/screens/`, 파일 이름은 `XxxScreen.tsx`
- 제목과 상단 inset은 native stack header가 가진다. `AppShell`은 좌우 inset + 스크롤 본문만 준다. bottom navigation은 실제 탭이 생길 때 넣는다
- **로컬 primitive를 만들지 않는다.** 공용 `@berrypjh/react-native-ui`(`Box` · `Stack` · `Button` · `ThemeProvider` 등)를 조합한다. 앱이 소유하는 것은 `AppShell`, 화면(`src/screens/`), 기능별 제품 조합(`src/components/auth/` 등)뿐이다
- **인증은 `src/auth/`다.** 화면은 `controller`만 부르고, API는 `api.ts`, 기기 저장 · 암호 · 시스템 인증 브라우저는 `device.ts`(expo-secure-store · expo-crypto · expo-web-browser)만 안다. provider 동의 화면은 `openAuthSessionAsync`로만 열고 제품 WebView에서 열지 않는다. 복귀 URL은 `callback.ts` 하나로 검사한다. credential을 AsyncStorage · route params · 로그 · WebView에 넣지 않는다. native header가 없는 인증 화면은 `AuthShell`이 상하좌우 inset을 가진다
- **온보딩은 `src/onboarding/`이다.** 흐름은 `app/OnboardingFlow.tsx`(안쪽 native stack)가 가진다. 진행(단계 · 목적)은 서버 `/v1/onboarding`(`progressApi.ts`)에 저장해 web과 이어지고, **사진 · 파일 주소 · 처리 상태는 저장하지 않는다** — 다시 열면 첫 사진 단계로 돌아간다. 목적 규칙 · 처리 계약과 조회 흐름(`runProcessing`)은 web과 함께 쓰는 `@snapdone/onboarding`에 있다. expo-image-picker는 `imagePicker.ts`만 알고, 카메라 권한은 누른 순간에만 묻는다. 처리 API는 `processingApi.ts`이고 credential은 `AuthController.authorized`로만 받는다. 처리 화면은 서버가 준 상태(처리 중 · 완료 · 실패)만 보이고 단계를 지어내지 않는다
- **홈은 네이티브다(`screens/HomeScreen.tsx` · `src/home/`).** `App.tsx`가 render function으로 `controller`를 넘기고, `useHomeData`가 화면이 보일 때마다(`useFocusEffect`) 최근 처리 기록과 처리 방식을 `authorized`로 함께 다시 읽는다 — 처리 설정 WebView에서 돌아오면 바뀐 값이 보인다. 값 · parser · 이름표 · 기록 상태(`recentState`)는 web과 같은 `@snapdone/processing`이다. 기록을 읽지 못하면 비었다고 하지 않고, 처리 방식을 읽지 못하면 기본값을 만들지 않는다

## 네이티브 셸 · WebView 호스트

mobile이 주 제품이다. 네비게이션 · 로그인 · 권한 · 푸시와 **Capture → Act 핵심 흐름은 네이티브로 만든다.** 결과 상세 · 기록 · 공지 · 약관 · 설정 일부는 web 화면을 WebView로 연다 ([target-architecture.md](../../docs/architecture/target-architecture.md#제품-구성--네이티브-셸--웹-콘텐츠)).

- 핵심 흐름을 WebView로 옮기지 않는다 (App Store 4.2 최소 기능). web 콘텐츠 화면을 RN으로 다시 만들지도 않는다
- `apps/web`을 import하지 않는다. WebView는 URL로만 연다
- WebView User-Agent 뒤에 `SnapdoneApp/<bridge 계약 버전>`을 붙인다(`applicationNameForUserAgent={inAppUserAgentName()}`)
- 로그인은 일회용 코드 핸드오프다 ([data-access.md](../../docs/architecture/data-access.md#webview-로그인-핸드오프)). 토큰을 `injectJavaScript` · URL로 넘기지 않는다
- `webViewNavigation`이 web origin의 허용 경로만 WebView 안에서 열고, 외부 https는 `Linking.openURL`, 그 외 scheme · 모르는 경로는 막는다. 경로를 추가하면 `WEB_VIEW_PATHS`에 넣는다. 뒤로 가기 · 닫기는 네이티브가 처리한다
- 핸드오프 · `auth-required` 처리는 `WebContentScreen` + `src/auth/webHandoff.ts`(순수 상태)다. 메시지는 보낸 page의 origin · path와 대기 상태를 확인한 뒤에만 받는다
- 메시지 타입은 `libs/`의 계약만 쓴다
- WebView 화면은 `src/screens/WebContentScreen.tsx` 하나를 재사용한다 — `navigate('WebContent', { path, title })`. 로딩 · 오류(다시 시도) · 외부 링크 · 로그인 핸드오프가 이미 들어 있다
- web 주소는 `EXPO_PUBLIC_WEB_BASE_URL` 하나이고 `src/lib/web.ts`만 읽는다. 링크를 WebView에 둘지 시스템으로 보낼지는 `webViewNavigation`이 정한다

## UI

**Web layout을 축소해서 옮기지 않는다.** 브라우저의 web은 사이드바, mobile은 헤더 + 스크롤 본문이다 (WebView 안의 web은 셸 없이 본문만). 같은 것은 사용자가 얻는 결과이지 화면 구조가 아니다. DOM API와 CSS 개념을 RN에 가져오지 않는다.

- **색 · 간격 · radius · 타이포는 공용 테마 토큰이다** — web과 같은 값이다 ([foundation.md](../../docs/design/foundation.md)). `useTheme()`로 받아 색은 `getColor(theme, 'text.default')`, 간격은 `theme.tokens.spacing.lg`, 글자는 `textStyle(theme.tokens.typography.paragraph.default)`(`src/theme/text.ts`)로 쓴다. 로컬 raw 값을 두지 않는다
- **theme은 시스템 설정을 따른다.** `App.tsx`의 `useColorScheme()` → `ThemeProvider mode`, `app.json` `userInterfaceStyle: "automatic"`. 네이티브 헤더는 `src/theme/navigationTheme.ts`가 같은 토큰으로 칠한다. 다크 값을 얻으려고 `Native.Dark.tokens`를 직접 고르지 않는다
- **line-height는 절대값이다.** RN이 비율을 받지 않는다. 공용 RN 토큰이 이미 숫자(px)로 준다
- `textStyle`은 토큰의 `fontFamily`(Pretendard)를 버린다 — 앱에 폰트 파일이 없어 시스템 폰트로 한국어를 그린다
- border는 `StyleSheet.hairlineWidth`
- `AppShell`의 Safe Area는 `edges={['left','right']}`다. top은 native stack header가 가진다. **bottom은 일부러 뺐다** — bottom navigation이 하단 inset을 직접 가져가야 이중 패딩이 안 생긴다. `android.edgeToEdgeEnabled: true`라 Safe Area 처리는 선택이 아니다
- hover와 focus 링이 없다. 공용 `Button`이 pressed · disabled · `accessibilityRole`을 처리한다. 직접 만드는 누를 수 있는 것은 최소 44px과 `accessibilityRole` · `accessibilityState`를 지킨다
- `<StatusBar />`는 `App.tsx`에 하나만 둔다. 화면마다 추가하지 않는다
- `AppShell`이 이미 세로 `ScrollView`(`keyboardShouldPersistTaps="handled"`)다. 그 안에 세로 `ScrollView`를 중첩하지 않는다
- 키보드를 가리는 입력이 생기면 회피 처리를 함께 넣는다
- 권한은 필요한 순간에, 이유를 밝히고 요청한다
- iOS와 Android를 모두 확인한다. 한쪽만 보고 완료로 보고하지 않는다

## 공용 UI API 조회

조회 순서와 금지 사항은 생성 rule `_generated/berry-consumer.md`, 실행 명령은 `.claude/harness.profile.md`의 consumer 조회.

- 버전을 올릴 때는 peer `react-native`가 현재 RN(0.85.3)을 포함하는지 먼저 본다
- RN 토큰은 `Native` 숫자 값이다. web의 CSS 문자열 값을 쓰지 않는다

## Test

`vitest.config.ts`는 `environment: 'node'`. `tsconfig.app.json`은 `types: []`다 — **RN은 Node가 아니므로 `@types/node`를 넣지 않는다.**
