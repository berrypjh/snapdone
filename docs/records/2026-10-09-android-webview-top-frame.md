# Android가 isTopFrame을 주지 않아 처리 결과 링크를 가로채지 못함

결과 링크를 `<a>`로 바꾼 뒤에도 결과가 탭 안 WebView에서 열림. Android 이동 이벤트에 `isTopFrame`이 없어 앱이 가로채지 않음. 값이 없으면 최상위로 보도록 수정하고, 보고 있는 탭을 다시 누르면 처음 page로 돌아가게 함.

## 증상

- **결과 화면에 갇힘** — [이전 수정](./2026-10-09-app-webview-title-inset-back.md) 뒤에도 결과가 탭 안에서 열림
- **외부 링크** — web origin 밖 https 링크도 시스템 브라우저로 가지 않음

## 원인

- **라이브러리** — react-native-webview 13.16.1 Android의 `onShouldStartLoadWithRequest` 이벤트에 `isTopFrame`이 없음. iOS만 채움
- **앱 검사** — `onOpenJob && isTopFrame`, `if (isTopFrame) openOutside(url)`. Android에서는 항상 거짓

## 반영

- **판단** — 값이 없으면 최상위 이동(`isTopFrame !== false`). iframe을 쓰는 page 없음
- **코드** — `apps/mobile/src/lib/web.ts`의 `isTopFrameRequest`
- **탭 다시 누르기** — 기록 탭에서 다시 누르면 첫 page로(`reopenSignal` → `reopenStart`)

## 검증

- **단위 테스트** — `isTopFrameRequest`, `reopenStart`
- **실기기** — 결과가 뒤로 가기 있는 새 화면으로 열림, 기록 탭 다시 누르기로 첫 화면
