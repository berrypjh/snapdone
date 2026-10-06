# Harness profile

berry-dev의 generic rule · skill(`repo-verify` · `frontend-quality`)이 가리키는 snapdone 사실이다. 사람이 읽는 문서이고, 사실이 바뀌면 이 파일만 고친다. 절차는 plugin skill에, 무엇이 옳은지는 `.claude/rules/`와 `AGENTS.md`에 있다.

## 검증

### 영향 범위

- 영향 확인 — `pnpm exec nx show projects --affected --files=<바뀐 파일, 쉼표 구분>`
- target 확인 — `pnpm exec nx show project <이름> --json`. 이름이 프로젝트마다 다르다(`api`는 `lint` · `typecheck` 대신 `vet` · `fmt`, `swagger-check`는 따로)
- `web` · `devhub` 변경은 `implicitDependencies`로 `web-e2e` · `devhub-e2e`까지 끌어온다. 의도된 동작
- `nx.json` · `tsconfig.base.json`은 전부를, 루트 `package.json` · `eslint.config.mjs`는 `api`를 뺀 전부를 끌어온다. 그때는 `pnpm verify`
- affected가 모르는 것
  - **DevHub catalog** — `apps/*` · `libs/*` · `docs/` · 루트 script · Nx target을 경로와 이름으로 인용하지만 Nx 의존이 아니다. 파일을 옮기거나 지웠거나, 문서 heading · 루트 script · Nx target · export 이름을 바꿨으면 `pnpm devhub:check`(캐시 안 함)
  - **두 앱의 짝** — `apps/web/src/lib/api.ts` · `apps/mobile/src/lib/api.ts`처럼 같은 계약을 따로 구현한 쌍은 한쪽만 고쳐도 양쪽을 본다. Go 응답 모양을 바꿨으면 `libs/auth-contracts`의 손으로 쓴 타입도 본다

### 프로젝트 밖 경로

`docs/**` · `.claude/**` · `tools/scripts/**`는 affected가 `[]`다.

| 바꾼 곳                                                                                | 검사                                                                                                                                                          |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.claude/hooks/**` · `tools/scripts/**`                                                | `pnpm test:hooks` · `pnpm exec eslint .claude/hooks tools/scripts`                                                                                            |
| `.claude/standards.json` · `.claude/harness-source.json` · `.claude/rules/_generated/` | `pnpm harness:check` — 고정 커밋의 shared-stack checkout(`SHARED_STACK_DIR`, 기본 `../shared-stack`)이 필요. 없거나 커밋이 다르면 exit 2이고 not-run으로 보고 |
| `.claude/**/*.md` · `docs/**`                                                          | `pnpm exec prettier --check <파일>`                                                                                                                           |
| `tools/evals/lab/**`                                                                   | `pnpm eval:lab:test`(uv)                                                                                                                                      |

### Go (`apps/api`)

- `apps/api/**`를 고쳤을 때만 — `pnpm exec nx affected -t vet,fmt,test --files=<바뀐 Go 파일>`
- `fmt`는 검사만 한다. 고치는 것은 `apps/api`에서 `gofmt -w .`
- 핸들러 · DTO · swag 주석을 바꿨으면 `nx run api:swagger` 뒤 `nx run api:swagger-check`
- `nx test api`는 Nx가 `apps/api/.env`를 환경에 넣어 config 테스트가 실패할 수 있다. 의심되면 `NX_LOAD_DOT_ENV_FILES=false`로 다시 돌려 비교([local-development.md](../docs/development/local-development.md#go-api는-env를-읽지-않는다))

### 의존 순서

- 없음. `libs/*`는 빌드 없는 source 패키지(`exports` → `./src/index.ts`)라 검사 전에 만들 산출물이 없다

### build 종류

- 로컬 산출물 — `web` · `devhub`(Next.js), `api`(Go). `pnpm build`는 `mobile`을 뺀다
- `mobile`의 `build`는 **EAS 클라우드 빌드**, `submit`은 스토어 제출 — 검증으로 실행하지 않음. 로컬 번들은 `nx export mobile`

### AI 세션에서 실행할 수 없는 것

- `pnpm dev:*` · `nx start` — 포트 바인딩 차단. local hook(`.claude/hooks/guard-bash.mjs`)이 막는다
- `pnpm e2e` · `nx e2e *` — Playwright가 dev 서버 포트를 연다
- `nx build web` · `nx build devhub` — Turbopack의 PostCSS 워커가 포트를 연다. `pnpm build`는 `api`까지 가고 여기서 멈춘다. 사용자 결과는 `.next/BUILD_ID` · `routes-manifest.json`으로 확인
- `pnpm health` — 다른 터미널의 `pnpm dev:api`가 필요
- mobile 런타임 — 시뮬레이터 · Detox · Maestro가 없다. 사용자 터미널에서도 수단이 없다

앞의 넷은 AI 세션에서만 막히고 사용자 터미널에서는 정상이다.

## UI

### 역할

| 경로          | 역할     | 따를 문서                                                 |
| ------------- | -------- | --------------------------------------------------------- |
| `apps/web`    | consumer | `.claude/rules/web.md` · `docs/design/foundation.md`      |
| `apps/mobile` | consumer | `.claude/rules/mobile.md` · `docs/design/foundation.md`   |
| `apps/devhub` | consumer | `.claude/rules/devhub.md` · `docs/architecture/devhub.md` |

UI 패키지 maintainer 경로는 이 저장소에 없다(shared-stack 소유).

### consumer 조회

- web — `pnpm --dir apps/web exec berry-react-ui <find|api|token> …`
- devhub — `pnpm --dir apps/devhub exec berry-react-ui <find|api|token> …`
- mobile — `pnpm --dir apps/mobile exec berry-react-native-ui <find|api|token> …`

### locale 과 제품 정책

- locale — `ko-KR`
- 셸
  - web — 제품 화면은 `AppShell`. 768px 이상 사이드바, 그 아래는 헤더. 앱 WebView 안(`isInAppRequest()`)에서는 셸 없이 `main`만
  - mobile — native stack header + `AppShell`(좌우 inset · 스크롤 본문), 인증 화면은 `AuthShell`
- 화면 폭 — web은 폰 폭 320–767px이 기본. **320px에서 가로 스크롤 없음**, 1280 · 768 · 767 · 320px 계약을 `apps/web-e2e/src/app-shell.spec.ts`가 고정
- 최소 터치 크기 — 44px(web `min-h-11`)
- 완료 문구 — 화면에 남는 마지막 문장은 완료된 행동. 기준은 [product-principles.md](../docs/product/product-principles.md#성공-화면의-정의)와 `.claude/rules/product-ui.md`
- theme · 토큰 — 값은 공용 패키지(web `@berrypjh/react-ui`, mobile `@berrypjh/react-native-ui`)가 소유하고 snapdone에서 바꾸지 않는다. web theme은 `<html data-theme>` 하나, mobile은 시스템 설정 → `ThemeProvider mode`. 조합 기준은 [foundation.md](../docs/design/foundation.md)

### 확인 수단

| 방식 | 있는 것                                                                                  | 이 세션에서                                |
| ---- | ---------------------------------------------------------------------------------------- | ------------------------------------------ |
| 자동 | vitest(`environment: 'node'` — 컴포넌트 렌더 테스트 없음), eslint jsx-a11y(web · devhub) | 실행 가능                                  |
| 실제 | `web-e2e` · `devhub-e2e` Playwright(반응형 · 키보드 · in-app 계약)                       | unsupported — 사용자 터미널에서 `pnpm e2e` |
| 실제 | mobile 실기기 · 스크린 리더                                                              | unsupported — 수단 없음                    |

## 한국어 화면

- 어미 — 합쇼체 `~습니다`, 요청은 `~해 주세요`(현재 화면 문구 기준). 사용자가 고르는 선택지 라벨(`모르겠어요`)은 사용자 말투라 예외
- 날짜 `2026. 8. 16.` · 금액 `12,000원` · 전화번호 `010-1234-5678`([product-principles.md](../docs/product/product-principles.md#한국-사용자-ux-원칙)). formatter는 아직 없다 — 두 앱이 쓰면 `libs/`, 한쪽만 쓰면 그 앱
- line-height 1.5 이상. 최소 터치 크기 · 좁은 화면 기준은 위 UI 절
- 어절 보호 — web `body`의 `word-break: keep-all` · `overflow-wrap: break-word`. mobile `Text`는 넘칠 수 있는 곳에 `numberOfLines`

## 한국어 문서

- 전환 상태 — 기록(`docs/records/`)은 전환 완료. 나머지 문서는 아직 서술체
