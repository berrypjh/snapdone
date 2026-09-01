# snapdone

사진과 스크린샷을 넣으면 무엇을 하려던 것인지 알아채고, 그 일을 대신 끝내주는 앱.

## 구조

| 위치          | 스택                       |
| ------------- | -------------------------- |
| `apps/web`    | Next.js 16 (App Router)    |
| `apps/mobile` | Expo SDK 56 + React Native |
| `apps/api`    | Go                         |
| `libs/`       | 공유 코드 (아직 비어 있음) |
| `tools/`      | 개발 도구                  |

Nx가 작업 orchestration을 담당한다.

## 시작하기

필요한 것: Node 24.14.0 (`.nvmrc`), pnpm 10.30.3, Go 1.26.6

lint · format · tsconfig 설정은 GitHub Packages의 `@berrypjh/*` 패키지에서 온다. **토큰이 없으면 `pnpm install`이 401로 실패한다.**

```bash
export GITHUB_TOKEN=<read:packages 권한이 있는 PAT>

nvm use
pnpm install

cp apps/web/.env.example apps/web/.env.local
cp apps/mobile/.env.example apps/mobile/.env
```

각 앱은 별도 터미널에서 띄운다.

```bash
pnpm dev:web      # http://localhost:3000
pnpm dev:api      # http://127.0.0.1:8080
pnpm dev:mobile   # Expo (Metro)
```

`pnpm dev`는 web과 api를 함께 띄운다. mobile은 대화형 프로세스라 따로 실행한다.

## 검증

```bash
pnpm verify   # format:check -> lint -> typecheck -> test -> test:hooks -> build
```

개별 실행은 `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

```bash
pnpm e2e      # Playwright (브라우저 필요, verify에 미포함)
pnpm health   # API 연결 확인 (개발자용)
pnpm graph    # Nx project graph
```

E2E를 처음 돌리기 전에 브라우저를 한 번 받아야 한다.

```bash
pnpm exec playwright install chromium firefox webkit
```
