# Android WebView가 메시지 보낸 page로 origin만 줘 핸드오프가 멈춤

앱 WebView 화면(기록 · 처리 설정)이 "로그인 정보를 확인하는 중입니다."에서 멈춤. 앱이 `handoff-ready`를 경로 검사에서 조용히 무시. 경로 검사를 빼고 origin · 대기 상태 · `next`로 판단하도록 수정.

## 증상

- **화면** — Android APK에서 web ready page(`/auth/handoff/ready`)에 머묾. 오류 화면 없음
- **서버** — web `start` `303` → `ready` `200` 뒤 api `POST /v1/auth/handoff/start` 없음. web은 `handoff-ready`를 정상 생성

## 원인

- **라이브러리** — react-native-webview 13.16.1 Android는 `WEB_MESSAGE_LISTENER`를 지원하는 WebView에서 `nativeEvent.url`에 origin만 넣음. 전체 URL은 구형 WebView 경로에서만 옴
- **앱 검사** — `receiveMessage`가 보낸 page 경로가 `/auth/handoff/ready`일 때만 받음. origin만 오면 항상 무시
- **가려진 이유** — 경로를 보지 않는 `ready`(제목) 메시지는 정상 동작. 단위 테스트는 전체 URL만 사용

## 반영

- **판단** — 경로 검사 제거. origin, 핸드오프 시작 뒤 첫 메시지(`awaitingReady`), `next` 일치로 판단. 같은 origin의 다른 page는 ready page로 이동할 수 있어 경로 검사로 막을 수 없음
- **코드** — `apps/mobile/src/auth/webHandoff.ts`의 `receiveMessage`
- **테스트** — origin만 오는 경우(받음), 다른 origin(무시)
- **진단 스위치** — `EXPO_PUBLIC_WEBVIEW_DEBUG=true`면 `webviewDebuggingEnabled`

## 검증

- **원인 확인** — `chrome://inspect`에서 손으로 보낸 `ready`는 반영되고 `handoff-ready`는 무시됨. logcat 임시 로그에서 `nativeEvent.url`이 origin만이고 `awaitingReady=true`로 남음. 방법은 [실기기 앱 디버깅](../development/local-development.md#실기기-앱-디버깅)
- **정적 검사** — `nx typecheck` · `nx lint` · `nx test` mobile 통과
- **실기기** — 수정본 APK에서 기록 목록 표시
