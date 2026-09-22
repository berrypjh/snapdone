---
paths:
  - 'apps/web-e2e/**'
  - 'apps/devhub-e2e/**'
---

# E2E (`apps/web-e2e` · `apps/devhub-e2e`)

Playwright 두 벌이다. `web-e2e`는 제품(web)을 가짜 인증 API와 함께 띄워 보고, `devhub-e2e`는 내부 도구(devhub)를 혼자 띄워 본다. 서로 다른 포트를 쓰므로 나란히 돌려도 부딪히지 않는다.

## AI 세션에서는 실행할 수 없다

브라우저 실행과 포트 바인딩이 막혀 있다. `pnpm exec playwright test --list`로 목록까지만 확인하고, **실행은 사용자에게 요청한다.** 돌리지 못했으면 "E2E는 실행하지 못했다"고 그대로 보고한다.

## 서버는 Playwright가 띄운다

- `web-e2e` — 가짜 인증 API(`src/support/fake-api.mts`, `127.0.0.1:4010`)와 그 API를 `API_BASE_URL`로 보는 `next dev`(:3000). **둘 다 `reuseExistingServer: false`** 라, 실제 Go API에 붙은 dev 서버를 잘못 재사용하지 않는다. 그래서 **실행 전에 `pnpm dev:web`을 끈다**
- `devhub-e2e` — `next dev --port 3100` 하나. 재사용을 허용한다
- `BASE_URL`을 주면 이미 떠 있는 서버를 본다. loopback 호스트만 받는다 — 공개 사이트를 상대로 도는 일이 없게

## 두 가지 함정

- **`e2e-ci--*` target을 직접 돌리지 않는다.** spec마다 Playwright를 따로 띄워 같은 포트를 두고 충돌한다. `pnpm e2e` 또는 `playwright test <spec>`으로 돌린다
- **`auth-faults.spec.ts`는 혼자 돈다.** 가짜 API의 전역 스위치를 뒤집기 때문에 다른 project가 끝난 뒤에 실행된다. 여기에 일반 시나리오를 넣지 않는다

## 테스트를 쓸 때

- **사용자가 보는 것으로 찾는다** — 역할과 이름(`getByRole('link', { name: '기록' })`). CSS 선택자 · 테스트 전용 id에 기대지 않는다
- 키보드 경로는 `src/support/keyboard.ts`의 `enterMain` · `tabTo`를 쓴다. "본문으로 건너뛰기"로 들어간 뒤 세는 것이 규칙이다 — 페이지 맨 위부터 Tab을 세면 셸 구조가 바뀔 때마다 깨진다
- 개수를 기대하는 단언(`목록 3개`)은 카탈로그가 바뀌면 깨진다. 꼭 필요할 때만 쓰고, 깨지면 데이터 쪽이 맞는지부터 본다
- 제목 · 문구는 화면에 보이는 한국어 그대로 쓴다. 번역하거나 줄이지 않는다
