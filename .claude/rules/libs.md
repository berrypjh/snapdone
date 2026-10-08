---
paths:
  - 'libs/**'
---

# libs (`libs/`)

지금 lib은 넷이고 web과 mobile이 모두 쓴다 — `webview-bridge`(앱 ↔ WebView 계약: User-Agent 토큰 · 메시지 타입), `auth-contracts`(인증 wire 타입: provider · 오류 코드 · `Session` · 온보딩 단계 · 로그인 응답 해석), `onboarding`(저장된 진행 단계 · 사진 처리 작업 계약과 조회 흐름), `processing`(처리 방식 · 제품 결과(`outcome` · `selection`) · 작업(`JobDetail` · `readJobDetail`) · 최근 처리 기록 계약과, 결과 화면 내용(`presentJob`) · 목록 요약(`summarizeJob`) · 기본값 저장 판단(`preferenceToSave`) · 금액 · 날짜 · 한국 시각 formatter). 분류 결과만 읽는 단건 처리 계약(`parseJob`)과 조회 흐름(`runProcessing`)은 `onboarding`에 있고 `processing`이 그것을 쓴다. `webview-bridge`에는 처리 결과 하나의 경로 규칙(`isJobDetailPath`)도 있다.

## 모양

- 빌드 없는 소스 패키지다. `package.json` `exports`가 `./src/index.ts`를 가리키고 앱은 `"@snapdone/<이름>": "workspace:*"`로 의존한다. web은 `next.config.js` `transpilePackages`에 추가한다
- 새 lib은 `nx g`를 그대로 쓰지 않는다 — 루트에 `.prettierrc` · `vitest.config.ts`를 새로 만들어 기존 설정과 충돌한다. `libs/webview-bridge`의 파일 구성을 따라 만들고, 앱에 의존을 추가한 뒤 `pnpm install` → `pnpm exec nx sync`로 TS reference를 맞춘다
- `nx.tags`에 `type:lib`을 둔다

## 들어오는 것과 들어오지 않는 것

만들 시점과 경계는 생성 rule `_generated/cross-runtime-pure.md`(`libs/*/src/**`). snapdone에서 더하는 것만 적는다.

- 들어갈 수 있는 것 — domain type · pure business logic · formatter(날짜 · 금액 · 전화번호 같은 ko-KR 규칙) · validation · constants · API contract TypeScript 코드
- platform-specific modal / sheet도 들어오지 않는다. `react-native-web`으로 universal UI가 가능하지만 양쪽 모두에서 어색해진다

## 경계 강제

경계는 **ESLint가 강제한다.** 루트 `eslint.config.mjs`가 공용 `@berrypjh/eslint-config/nx`의 허용 기본값을 덮어 쓴다.

| tag        | 의존할 수 있는 것 | 금지된 외부 import                                                                                          |
| ---------- | ----------------- | ----------------------------------------------------------------------------------------------------------- |
| `type:app` | `type:lib`        | —                                                                                                           |
| `type:e2e` | `type:lib`        | —                                                                                                           |
| `type:lib` | `type:lib`        | react · react-dom · react-native(`-*`) · next · expo(`-*`, `@expo/*`) · `@react-navigation/*` · 공용 UI kit |

web · mobile은 `package.json` `nx.projectType: "application"`이다. 빠지면 Nx가 library로 추론해 "buildable library" 오류가 난다.

의존 방향은 [target-architecture.md](../../docs/architecture/target-architecture.md) 기준이다. `libs/`는 어떤 app도 알지 못하고, app 사이의 직접 참조는 없다.
