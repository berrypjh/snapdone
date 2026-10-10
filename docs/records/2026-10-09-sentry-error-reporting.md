# api · web · mobile에 Sentry 오류 보고 추가

오류를 알아채는 수단이 Cloud Logging 검색뿐이었음. 세 앱의 오류를 Sentry로 모으되, 사진 처리 결과 · 인증 값이 넘어가지 않게 제한.

## 상황

- **오류 인지 지연** — 사용자가 알려 주기 전에는 브라우저 · 앱 오류를 볼 수 없음
- **민감한 입력** — 사진에 이름 · 전화번호 · 계좌번호가 흔함. 인증 URL에 일회용 code가 실림

## 판단

- **DSN이 없으면 꺼짐** — 로컬 · Expo Go · e2e에는 영향 없음
- **요청 데이터 미전송** — 헤더 · 쿠키 · 본문 · IP를 보내지 않음. URL은 query를 뗌
- **화면 수집 미사용** — Session Replay · 스크린샷 · 화면 구조. 화면에 처리 결과가 보임
- **api는 `sentry-go`만** — `sentry-go/gin`은 요청 정보를 이벤트에 붙여 쓰지 않음. 기존 `logFailure` · recovery에서 `report`로 보냄. panic은 로그와 같이 타입만
- **web은 `@sentry/nextjs` v11** — 브라우저 `instrumentation-client.ts`, 서버 `onRequestError`. `withSentryConfig`는 v11부터 `@sentry/nextjs/config`에서 가져옴
- **mobile은 `@sentry/react-native` 7.11** — Expo SDK 56 지정 버전. console · 터치 기록 미전송, `Sentry.wrap` 미사용
- **소스맵 업로드 보류** — auth token이 필요. 수집부터 확인. Expo config plugin도 업로드용이라 넣지 않음
- **web DSN은 빌드 때 주입** — 브라우저 번들에 들어가는 공개 값. Secret Manager `WEB_SENTRY_DSN` 한 곳에서 `deploy.sh`가 읽음

## 반영

- **api** — `internal/httpserver`의 `report`, `cmd/server`의 `initSentry`, secret `SENTRY_DSN`
- **web** — `src/lib/sentry/`, `instrumentation*.ts`, `next.config.js`, `Dockerfile` build arg
- **mobile** — `src/lib/sentry.ts` · `sentryScrub.ts`, `index.js`, EAS 변수 `EXPO_PUBLIC_SENTRY_DSN`

## 검증

- **단위 테스트** — api panic 이벤트에 panic 값 · 토큰 없음, web · mobile 제거 함수
- **web build** — `next build` 성공
- **미검증** — 실제 이벤트 수신. 배포 · 새 APK 뒤 확인
