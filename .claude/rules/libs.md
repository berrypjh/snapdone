---
paths:
  - 'libs/**'
---

# libs (`libs/`)

이 규칙은 `libs/` 파일을 열 때 읽힌다. 지금 lib은 `webview-bridge` 하나다 — 앱 ↔ WebView 계약(User-Agent 토큰 · 메시지 타입)이며 web과 mobile이 둘 다 쓴다.

## 모양

- 빌드 없는 소스 패키지다. `package.json` `exports`가 `./src/index.ts`를 가리키고 앱은 `"@snapdone/<이름>": "workspace:*"`로 의존한다. web은 `next.config.js` `transpilePackages`에 추가한다
- 새 lib은 `nx g`를 그대로 쓰지 않는다 — 루트에 `.prettierrc` · `vitest.config.ts`를 새로 만들어 기존 설정과 충돌한다. `libs/webview-bridge`의 파일 구성을 따라 만들고, 앱에 의존을 추가한 뒤 `pnpm install` → `pnpm exec nx sync`로 TS reference를 맞춘다
- `nx.tags`에 `type:lib`을 둔다

## 만들 시점

**두 번째 사용처가 실제로 나타났을 때** 만든다. "나중에 쓸 것 같아서" 미리 만들지 않는다. 한 앱에서만 쓰는 동안에는 그 앱 안에 둔다.

## 들어갈 수 있는 것

domain type · pure business logic · formatter(날짜 · 금액 · 전화번호 같은 ko-KR 규칙) · validation · constants · API contract TypeScript 코드

## 들어가면 안 되는 것

DOM component · React Native component · CSS · browser API · native API · platform navigation · platform-specific modal / sheet

**한 파일이 `document`나 `react-native`를 import한다면 그것은 `libs/`에 있을 코드가 아니다.** `react-native-web`이 설치돼 있어 기술적으로는 가능하지만, 그렇게 만든 universal UI는 양쪽 플랫폼 모두에서 어색해진다.

## lib을 만들 때 함께 할 일

위 규칙은 **ESLint가 강제한다.** 루트 `eslint.config.mjs`가 공용 `@berrypjh/eslint-config/nx`의 허용 기본값을 덮어 쓴다.

| tag        | 의존할 수 있는 것 | 금지된 외부 import                                                                                          |
| ---------- | ----------------- | ----------------------------------------------------------------------------------------------------------- |
| `type:app` | `type:lib`        | —                                                                                                           |
| `type:e2e` | `type:lib`        | —                                                                                                           |
| `type:lib` | `type:lib`        | react · react-dom · react-native(`-*`) · next · expo(`-*`, `@expo/*`) · `@react-navigation/*` · 공용 UI kit |

web · mobile은 `package.json` `nx.projectType: "application"`이다. 빠지면 Nx가 library로 추론해 "buildable library" 오류가 난다.

의존 방향은 [target-architecture.md](../../docs/architecture/target-architecture.md) 기준이다. `libs/`는 어떤 app도 알지 못하고, app 사이의 직접 참조는 없다.
