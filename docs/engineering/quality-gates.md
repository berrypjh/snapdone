# Quality Gates

여기 적힌 명령은 전부 실제로 존재하고 통과하는 것들이다. 동작하지 않는 명령은 적지 않는다.

## PR 올리기 전에

```bash
pnpm verify
```

`format:check → lint → typecheck → test → test:hooks → build` 순으로 돌고, 하나라도 실패하면 거기서 멈춘다. 하나씩 돌리려면 아래를 쓴다.

| 명령                | 실제로 도는 것                          | 대상                                                                      |
| ------------------- | --------------------------------------- | ------------------------------------------------------------------------- |
| `pnpm format:check` | `prettier --check .`                    | 저장소 전체 (`.prettierignore` 제외)                                      |
| `pnpm lint`         | `nx run-many -t lint,vet,fmt`           | web · mobile · commit-mcp · web-e2e는 eslint, api는 `go vet` + gofmt 검사 |
| `pnpm typecheck`    | `nx run-many -t typecheck`              | web · mobile · commit-mcp · web-e2e                                       |
| `pnpm test`         | `nx run-many -t test`                   | api는 `go test`, web · mobile은 Vitest                                    |
| `pnpm test:hooks`   | `node --test tools/scripts/*.test.mjs`  | `.claude/hooks/` — Nx 프로젝트가 아니라 별도 명령이다                     |
| `pnpm build`        | `nx run-many -t build --exclude=mobile` | web · api · commit-mcp                                                    |
| `pnpm e2e`          | `nx run-many -t e2e`                    | web-e2e — **`verify`에 포함되지 않는다**                                  |

`test:hooks`는 Node 24 내장 러너를 쓴다. 의존성이 없다.

`nx run-many`는 해당 target이 없는 프로젝트를 조용히 건너뛴다. 없는 target 때문에 실패하지 않는다.

### 공유 설정 패키지

lint · format · tsconfig는 직접 정의하지 않고 `@berrypjh/*` 공유 패키지를 상속한다. GitHub Packages에 있어 `.npmrc`와 `GITHUB_TOKEN`이 필요하다.

| 패키지                        | 연결 지점                      | 주는 것                                                                 |
| ----------------------------- | ------------------------------ | ----------------------------------------------------------------------- |
| `@berrypjh/eslint-config`     | `eslint.config.mjs`            | `base`(import 정렬 · unused-imports · no-explicit-any) · `nx` · `react` |
| `@berrypjh/prettier-config`   | `package.json`의 `prettier` 키 | `printWidth: 100` · `singleQuote` · md/yaml override                    |
| `@berrypjh/tsconfig`          | `tsconfig.base.json`           | `next.json`(앱) · `library.json`(`commit-mcp`)                          |
| `@berrypjh/commitlint-config` | `commitlint.config.js`         | type 11종 · `!:` 금지                                                   |

**`.prettierrc`는 없다.** 저자 규약대로 `package.json`의 `"prettier"` 키로 지정한다.

#### 이 저장소에서 다르게 한 것

`jsx-a11y`는 **web에만** 붙인다. `apps/web/eslint.config.mjs`가 `@berrypjh/eslint-config/react`를 쓰고 `apps/mobile`은 쓰지 않는다. React Native에는 DOM이 없어 `no-autofocus` 같은 규칙이 오탐이 된다.

`flat/react-typescript`는 TS 규칙만 얹고 플러그인을 등록하지 않는다. 그래서 web에는 `react-hooks`와 `jsx-a11y`가 **원래 하나도 걸려 있지 않았다.** `/react`가 둘 다 채운다.

`lint-staged`의 `*.go` → `gofmt -w`도 이 저장소 고유다. `api`에 `lint` 타겟이 없어서다.

### `format`이 `nx format`이 아닌 이유

`nx format:check`는 **base 대비 변경된 파일만** 검사한다. 한 번 포맷이 어긋난 채 들어온 파일은 이후 손대지 않는 한 영원히 검사되지 않는다. 실제로 `tools/mcp/commit/`의 5개 파일이 그 상태로 방치돼 있었다. `prettier --check .`는 저장소 전체를 본다.

### 커밋 시점 게이트

`pnpm verify`는 사람이 기억해서 돌려야 하지만, 커밋에는 자동으로 걸리는 것이 있다.

| 훅                  | 하는 일                                                      |
| ------------------- | ------------------------------------------------------------ |
| `.husky/pre-commit` | `lint-staged` — staged 파일에 eslint · prettier · gofmt 적용 |
| `.husky/commit-msg` | `commitlint` — 커밋 메시지 형식 강제                         |

`git commit --no-verify`로 건너뛸 수 있다. 처음 clone하면 `pnpm install`이 `prepare` 스크립트로 husky를 설치한다.

### `verify`가 e2e를 빼는 이유

`pnpm e2e`는 브라우저 바이너리(약 500MB)와 실행 중인 dev 서버를 요구한다. 로컬에서 매번 돌리기엔 무겁고, 없으면 실패하므로 기본 게이트에 넣지 않았다. CI에서는 별도 잡으로 돌린다.

브라우저를 아직 받지 않았다면 한 번 받아야 한다.

```bash
pnpm exec playwright install chromium firefox webkit
```

CI에서는 파일 단위로 병렬화된 `e2e-ci` target을 쓸 수 있다. `@nx/playwright/plugin`이 spec 파일마다 `e2e-ci--src/<file>` target을 자동 생성한다.

### `build`가 mobile을 빼는 이유

`mobile`의 `build` target은 로컬 빌드가 아니라 **EAS 클라우드 빌드**다. Expo 계정과 자격 증명이 필요하고 원격에서 돈다. 로컬 게이트에 섞이면 안 된다.

모바일 번들을 로컬에서 확인하려면:

```bash
pnpm exec nx export mobile
```

## 테스트 현황 — 솔직하게

| 프로젝트   | 종류 | 명령        | 상태             |
| ---------- | ---- | ----------- | ---------------- |
| api        | 단위 | `pnpm test` | Go 6개           |
| web        | 단위 | `pnpm test` | Vitest 6개       |
| mobile     | 단위 | `pnpm test` | Vitest 6개       |
| web-e2e    | E2E  | `pnpm e2e`  | 5개 × 3 브라우저 |
| commit-mcp | 단위 | 없음        | **러너 미설치**  |

지금 덮인 것은 **`apps/*/src/lib/api.ts`뿐이다.** 화면 컴포넌트, 디자인 토큰, App Shell에는 단위 테스트가 없다. web의 셸 동작은 E2E가 대신 잡는다.

`commit-mcp`는 아직 비어 있다. `scope.ts`의 경로→scope 판정은 이 저장소에 맞춰 손으로 고친 부분이라(`packages` → `libs`) 테스트로 고정할 값어치가 있다.

### 단위 테스트 실행 방식

`nx.json`의 `@nx/vitest` 플러그인이 `testMode: "run"`이라 `nx test`는 **한 번 돌고 끝난다**(`vitest run`). 기본값인 `"watch"`로 두면 터미널에서 `pnpm verify`가 watch 모드에 걸려 멈춘다.

개발 중 watch가 필요하면 앱 디렉터리에서 직접 띄운다.

```bash
cd apps/web && pnpm exec vitest
```

`vitest.config.ts`는 `environment: 'node'`다. `lib/api.ts`가 순수 TS라 DOM이 필요 없다. **React 컴포넌트를 단위 테스트하게 되면** `jsdom`, `@testing-library/react`, `@vitejs/plugin-react`를 그때 함께 추가한다. 지금 넣으면 쓰지 않는 의존성이 된다.

spec 파일도 `pnpm typecheck`가 검사한다. 생성기가 넣어둔 `*.spec.ts` exclude를 두 앱의 tsconfig에서 제거했다. 그대로 두면 vitest가 타입을 벗겨내기만 해서 스펙이 전혀 타입 검사되지 않는다.

### E2E 범위

`apps/web-e2e`는 부트스트랩 화면과 **반응형 셸 계약**을 고정한다. 유틸리티 클래스 하나만 잘못 고쳐도 잡히는 것들이다.

- `<html lang="ko">`, `<h1>` 텍스트, 상태 문구
- 1280px에서 사이드바(`complementary` 랜드마크) 노출
- 767px에서 사이드바 사라지고 헤더(`banner`)가 제품명을 대신 표시
- 320px에서 가로 스크롤 없음 — 한국어 텍스트가 길어 실제로 터질 수 있는 지점

역할 기반 선택자를 쓰므로 시맨틱 랜드마크까지 함께 검증된다. 자세한 계약은 [design/foundation.md](../design/foundation.md).

**mobile에는 E2E가 없다.** Detox는 시뮬레이터/에뮬레이터가 필요한데 이 환경에 없고(full Xcode·Android SDK 미설치), 검증할 사용자 흐름도 아직 없다. 실제 화면이 생기고 실행 환경이 갖춰지면 그때 판단한다.

## Go

```bash
pnpm exec nx fmt api     # gofmt 위반 시 실패
pnpm exec nx vet api     # go vet ./...
pnpm exec nx test api    # go test ./...
pnpm exec nx build api   # dist/apps/api/api
```

앞의 셋은 `pnpm lint`와 `pnpm test`에 이미 포함되어 있다.

`fmt` target은 파일을 고쳐 쓰지 않고 **검사만 한다.** CI가 소스를 바꾸면 안 되기 때문이다. 위반이 나오면 로컬에서 `gofmt -w .`로 고친다.

## API 연결 확인

```bash
pnpm dev:api    # 다른 터미널
pnpm health
```

`pnpm health`는 web 앱의 `fetchHealth`를 그대로 호출한다. 제품 화면이 아니라 개발자용 명령이다.

## Dependency 추가 원칙

설치하기 **전에** 아래를 순서대로 확인하고 그 결과를 설명한다.

1. 기존 dependency로 되는가
2. 표준 라이브러리로 되는가 (Go stdlib, Node 내장, Web API)
3. 현재 platform SDK로 되는가 (Next.js / Expo)
4. 그래도 필요하면 왜 필요한지

**"편해서"는 사유가 아니다.**

부트스트랩에서 실제로 적용된 예:

- `/health` 하나 때문에 axios를 넣지 않았다. Node 24와 RN 0.85 모두 `fetch`를 기본 제공한다
- Go health endpoint에 Gin/Echo/Chi를 넣지 않았다. Go 1.22+ `http.ServeMux`의 메서드 라우팅으로 충분하다
- `react-native-safe-area-context`는 넣었다. RN의 `SafeAreaView`가 deprecated이고 Android edge-to-edge를 처리하지 못해서다

### mobile에 패키지를 추가할 때

버전을 임의로 고르지 않는다. Expo SDK가 지정한 값을 쓴다.

```bash
node -e "console.log(require('expo/bundledNativeModules.json')['패키지명'])"
```

그리고 **루트 `package.json`에 실제 버전을, `apps/mobile/package.json`에는 `"*"`를** 적는다. 루트에 빠뜨리면 `"*"`가 레지스트리 최신 버전으로 해석되어 SDK와 어긋난 패키지가 들어온다. 실제로 부트스트랩 중 `jest-expo@57`이 이렇게 들어왔었다.

### Nx 플러그인

개별 `pnpm add` 금지. `nx add` 또는 `nx migrate`만 쓴다. `nx`와 모든 `@nx/*`는 정확히 같은 버전이어야 한다.

## Security 기본 원칙

### Secret

- 실제 secret을 커밋하지 않는다
- `.env`, `.env.local`, `.env.*.local`은 git에서 제외된다. `.env.example`은 추적된다
- **`.env.example`에는 예시 값만 둔다.** 지금 들어 있는 값은 전부 localhost 개발 주소다

### 클라이언트에 노출되는 값

- `NEXT_PUBLIC_*`는 브라우저 번들에, `EXPO_PUBLIC_*`는 앱 번들에 **인라인된다.** 접두사가 붙은 값은 공개된 값이다
- 이 접두사 뒤에 secret을 두지 않는다. 모바일 앱에는 서버가 없으므로 앱이 아는 값은 전부 공개값이다
- web의 API 주소는 `API_BASE_URL`이다. 접두사가 없다 — Server Component에서만 쓰이므로 브라우저에 갈 이유가 없다

### Backend

- **오류 응답에 내부 정보를 담지 않는다.** 스택, 파일 경로, SQL, 내부 식별자 모두 밖으로 내보내지 않는다. 현재 클라이언트로 나가는 경로는 `writeJSON` 하나뿐이다
- 서버 설정은 환경변수로 받는다. 하드코딩하지 않는다
- CORS는 **필요해질 때** 넣는다. 지금은 cross-origin 요청 주체가 없어 CORS 코드가 아예 없다
- CORS를 넣게 되면 허용 origin을 설정으로 관리하고 dev/production을 분리한다. **production에서 `*`를 쓰지 않는다**

자세한 판단 근거는 [data-access.md](../architecture/data-access.md).

### 로깅

- 토큰, 비밀번호, 개인정보, **이미지 내용**을 로그에 남기지 않는다
- 이 제품의 입력은 스크린샷이다. 이름·전화번호·계좌번호가 흔히 들어 있다. 이미지나 그 분석 결과 원문을 로그로 뱉지 않는다
- 현재 Go 로그는 수명주기 이벤트(리스닝 주소, 종료, 서버 오류)뿐이다

### 앱 코드의 `console`

앱 소스에 `console.*`를 남기지 않는다. 현재 남아 있는 것은 CLI 도구뿐이며, 거기서는 출력이 곧 인터페이스다.

- `tools/scripts/check-api-health.mjs` — 검사 결과 출력
- `tools/mcp/commit/src/index.ts` — STDIO MCP 서버라 **stdout을 쓰면 프로토콜이 깨진다.** stderr로만 남긴다

### 자동 실행되는 코드

`.claude/hooks/` · `.husky/` · `commitlint.config.js` · `package.json`의 `prepare`/`lint-staged`는 **아무도 실행을 지시하지 않아도 돈다.** 이 파일들을 건드리는 변경은 일반 코드와 다르게 리뷰한다. 무엇이 언제 도는지와 리뷰 절차는 [.claude/README.md의 신뢰 표면](../../.claude/README.md#신뢰-표면).

lint · format · tsconfig · commitlint 설정은 **npm 공식 레지스트리가 아니라** GitHub Packages(`@berrypjh/*`)에서 온다.

## TypeScript

- `any`를 남용하지 않는다. 외부 응답은 좁은 타입 가드로 확인한다 (`apps/*/src/lib/api.ts` 참고)
- unused import·dead code를 남기지 않는다. `tsconfig.base.json`의 `noUnusedLocals`가 잡는다
- 생성된 tsconfig를 한 번에 "초엄격"으로 바꾸지 않는다. 새로 쓰는 코드에서 타입을 분명히 하는 쪽으로 간다

## 접근성

화면을 추가할 때마다 확인한다.

**Web** — `html lang="ko"` / `header`·`main`·`aside` 같은 시맨틱 landmark / 전역 `:focus-visible` 포커스 링 / 클릭 가능한 것은 `<button>` 또는 `<a>`

**Mobile** — `accessibilityRole` / 최소 44px 터치 타깃 / Safe Area

**공통** — 긴 한국어 문장에서 버튼·카드 제목이 깨지지 않는지. 한국어는 영어보다 길고 줄바꿈 규칙이 다르다.

토큰과 원칙은 [design/foundation.md](../design/foundation.md).
