# Quality Gates

여기 적힌 명령은 전부 실제로 존재하고 통과하는 것들이다. 동작하지 않는 명령은 적지 않는다.

## PR 올리기 전에

```bash
pnpm verify
```

`lint → typecheck → test → build` 순으로 돌고, 하나라도 실패하면 거기서 멈춘다. 하나씩 돌리려면 아래를 쓴다.

| 명령                | 실제로 도는 것                          | 대상                                                            |
| ------------------- | --------------------------------------- | --------------------------------------------------------------- |
| `pnpm lint`         | `nx run-many -t lint,vet,fmt`           | web · mobile · commit-mcp는 eslint, api는 `go vet` + gofmt 검사 |
| `pnpm typecheck`    | `nx run-many -t typecheck`              | web · mobile · commit-mcp                                       |
| `pnpm test`         | `nx run-many -t test`                   | **api만** — 아래 참조                                           |
| `pnpm build`        | `nx run-many -t build --exclude=mobile` | web · api · commit-mcp                                          |
| `pnpm format:check` | `nx format:check`                       | prettier (TS/JS/JSON/MD)                                        |

`nx run-many`는 해당 target이 없는 프로젝트를 조용히 건너뛴다. 없는 target 때문에 실패하지 않는다.

### `build`가 mobile을 빼는 이유

`mobile`의 `build` target은 로컬 빌드가 아니라 **EAS 클라우드 빌드**다. Expo 계정과 자격 증명이 필요하고 원격에서 돈다. 로컬 게이트에 섞이면 안 된다.

모바일 번들을 로컬에서 확인하려면:

```bash
pnpm exec nx export mobile
```

## 테스트 현황 — 솔직하게

| 프로젝트   | 테스트          | 상태            |
| ---------- | --------------- | --------------- |
| api        | `go test ./...` | 6개 통과        |
| web        | 없음            | **러너 미설치** |
| mobile     | 없음            | **러너 미설치** |
| commit-mcp | 없음            | **러너 미설치** |

`pnpm test`가 초록불이어도 **web과 mobile은 테스트되지 않은 것이다.** 지금은 부트스트랩 화면뿐이라 테스트할 동작이 없어서 러너를 넣지 않았다.

첫 번째로 테스트가 필요해지는 대상은 `apps/*/src/lib/api.ts`다. 환경변수 누락 처리와 응답 형식 가드는 지금 수동으로만 확인했다. 화면 로직이 생기는 시점에 러너를 도입하고 이 표를 갱신한다.

E2E(Playwright / Cypress / Detox)는 **실제 기능 flow가 생긴 뒤에** 판단한다. 검증할 사용자 흐름이 없는 상태에서 E2E 하네스부터 만들지 않는다.

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
