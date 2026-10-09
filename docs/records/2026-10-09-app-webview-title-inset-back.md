# 앱 WebView의 제목 중복 · 하단 가림 · 결과 화면에서 돌아갈 수 없음 수정

Android APK의 WebView 화면 문제 세 가지. 제목은 네이티브 헤더가 갖고, 하단 탭 없는 화면은 시스템 바만큼 띄우고, 처리 결과 링크는 `<a>`로 변경.

## 증상

- **제목 중복** — 네이티브 헤더 아래 web `<h1>`이 같은 글자로 한 번 더 보임
- **하단 가림** — `WebContent` 화면의 마지막 내용이 시스템 내비게이션 바 아래에 깔림
- **돌아갈 수 없음** — 기록 항목을 누르면 결과가 탭 안 WebView에서 열림. 뒤로 가기 없음

## 원인

- **제목** — web은 앱 안에서 셸만 숨기고 `<h1>`은 그대로 그림
- **하단** — `edgeToEdgeEnabled: true`인데 `WebContent` 화면에 아래 여백이 없음
- **결과 링크** — `next/link`는 문서를 다시 불러오지 않아 앱의 `onShouldStartLoadWithRequest`가 호출되지 않음

## 반영

- **제목** — `global.css`의 `in-app` variant, `<h1>`에 `in-app:sr-only`
- **하단** — `WebContentScreen`의 `insetBottom`
- **결과 링크** — `components/recent-jobs.tsx`를 `<a>`로
- **Android 뒤로 가기** — WebView 안 이전 page가 있으면 먼저 그쪽으로
- **보류** — web이 앱에 화면 열기를 요청하는 메시지. 요청할 동작이 늘면 추가

## 검증

- **정적 검사** — web · mobile `typecheck` · `lint` · `test` 통과
- **실기기** — 제목 한 번, 하단 가림 없음. 결과 화면 이동은 [isTopFrame 수정](./2026-10-09-android-webview-top-frame.md) 뒤에 해결
