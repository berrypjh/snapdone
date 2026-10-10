# mobile에 EAS Update 추가 — runtimeVersion은 appVersion

JS만 바꿔도 APK를 다시 빌드해 설치해야 했음. 설치된 앱이 JS 번들을 받아 오도록 변경.

## 상황

- **느린 반영** — 문구 하나를 고쳐도 EAS 클라우드 빌드 → APK 다운로드 → 설치
- **기기 확인 반복** — Android WebView 수정처럼 기기에서만 드러나는 문제를 고칠 때마다 다시 빌드

## 판단

- **`expo-updates` `~56.0.24`** — Expo SDK 56 지정 버전
- **runtimeVersion 정책 `appVersion`** — `fingerprint`는 네이티브 변경을 자동으로 잡지만 모노레포에서 로컬과 EAS 서버의 계산이 어긋나면 업데이트가 조용히 적용되지 않음. 예측 가능한 쪽을 고르고, 네이티브가 바뀌면 `version`을 직접 올림
- **채널은 빌드 프로필 이름** — preview APK는 `preview`, production은 `production`
- **`--environment preview` 필수** — EAS의 `EXPO_PUBLIC_*`를 번들에 넣음

## 반영

- **설정** — `app.json`의 `runtimeVersion` · `updates.url`, `eas.json`의 `channel`
- **규칙** — 네이티브 변경 시 `version`을 올리고 다시 빌드

## 검증

- **설정 해석** — `expo config`에서 `runtimeVersion` · `updates.url` 확인
- **미검증** — 새 APK에서 업데이트 수신
