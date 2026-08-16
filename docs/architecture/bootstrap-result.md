# Bootstrap Result

부트스트랩이 끝난 시점의 저장소 상태다. 아래 버전은 전부 실제 설치된 것을 읽은 값이다.

## Stack

| 항목         | 버전                              |
| ------------ | --------------------------------- |
| Node         | 24.14.0                           |
| pnpm         | 10.30.3                           |
| Nx           | 23.1.1 (`nx`와 모든 `@nx/*` 동일) |
| Next.js      | 16.1.7                            |
| React        | 19.2.8                            |
| Expo SDK     | 56.0.19                           |
| React Native | 0.85.3                            |
| Go           | 1.26.6                            |
| TypeScript   | 6.0.3                             |
| Tailwind CSS | 4.3.3                             |
| ESLint       | 9.39.5                            |
| Prettier     | 3.9.6                             |

**Expo는 SDK 56에 고정한다.** `@nx/expo`가 아직 SDK 57을 생성·마이그레이션하지 못한다 (nrwl/nx#36443 open). 버전 변경은 개별 install이 아니라 `nx migrate`로만 한다.

## Projects

```
$ nx show projects
["commit-mcp", "mobile", "api", "web"]
```

| project      | 위치               | 내용                                     |
| ------------ | ------------------ | ---------------------------------------- |
| `web`        | `apps/web`         | Next.js App Router. 부트스트랩 화면 하나 |
| `mobile`     | `apps/mobile`      | Expo 앱. 부트스트랩 화면 하나            |
| `api`        | `apps/api`         | Go 서버. `GET /health` 하나              |
| `commit-mcp` | `tools/mcp/commit` | 커밋 메시지 MCP 서버 (개발 도구)         |

프로젝트 간 의존은 **0건**이다. 순환 참조 없음, web과 mobile 사이 직접 참조 없음.

`libs/`는 비어 있다. 재사용이 실제로 발생하기 전에 라이브러리를 만들지 않는다.

## Commands

```bash
pnpm verify       # lint -> typecheck -> test -> build

pnpm dev          # web + api
pnpm dev:web      # http://localhost:3000
pnpm dev:api      # http://127.0.0.1:8080
pnpm dev:mobile   # Expo (Metro)

pnpm lint         # eslint(web/mobile/commit-mcp) + go vet + gofmt 검사
pnpm typecheck    # tsc (web/mobile/commit-mcp)
pnpm test         # go test — api만
pnpm build        # web + api + commit-mcp (mobile 제외)
pnpm format       # prettier
pnpm health       # API 연결 확인 (개발자용)
pnpm graph        # Nx project graph
```

`pnpm build`가 mobile을 빼는 이유: `mobile:build`는 로컬 빌드가 아니라 EAS 클라우드 빌드다. 로컬 번들은 `nx export mobile`.

## Architecture

```
apps/web     Next.js   ─┐
                        ├─→ lib/api.ts ─→ Go /health
apps/mobile  Expo     ──┘
apps/api     Go
libs/        (비어 있음)
tools/       개발 도구
docs/        문서
```

- **web은 Server Component에서** API를 호출한다. 브라우저가 Go를 직접 부르지 않으므로 **CORS 설정이 없다**
- **mobile은 기기에서 직접** 호출한다. 서버가 없으므로 base URL이 공개값이다
- API 주소를 아는 파일은 앱당 하나 (`src/lib/api.ts`)
- 디자인 토큰은 플랫폼별로 구현하고 [foundation.md](../design/foundation.md)를 값의 기준으로 삼는다. 공유 라이브러리로 묶지 않았다

자세한 경계는 [target-architecture.md](./target-architecture.md), 호출 규칙은 [data-access.md](./data-access.md).

## Environment

앱마다 자기 디렉터리에서 읽는다. 루트 공용 `.env`는 없다.

| 앱     | 변수                                | 기본값                               |
| ------ | ----------------------------------- | ------------------------------------ |
| web    | `API_BASE_URL`                      | 없음 — 누락 시 오류                  |
| mobile | `EXPO_PUBLIC_API_BASE_URL`          | 없음 — 누락 시 오류                  |
| api    | `API_HOST` / `API_PORT` / `API_ENV` | `127.0.0.1` / `8080` / `development` |

```bash
cp apps/web/.env.example apps/web/.env.local
cp apps/mobile/.env.example apps/mobile/.env
```

web 변수에 `NEXT_PUBLIC_` 접두사가 없는 것은 의도적이다. Server Component에서만 쓰이므로 브라우저 번들에 갈 이유가 없다.

Go 서버는 `.env` 파일을 읽지 않는다. 프로세스 환경변수만 본다.

## Current Scope

**지금 있는 것은 인프라와 부트스트랩뿐이다.** 제품 기능은 하나도 구현되지 않았다.

구현된 것:

- Nx monorepo와 세 앱의 골격
- 앱별 부트스트랩 화면 (서비스명 + 소개 문구 + 상태 문구)
- 디자인 토큰과 App Shell
- Go `GET /health` 하나
- 검증 명령과 문서

**아직 구현하지 않은 것:**

- 인증
- 실제 이미지 업로드
- AI 분석
- 장소
- 캘린더
- 영수증
- 번역
- 자동화
- DB
- production 배포

이 목록은 "예정"이 아니라 "없음"이다. 위 기능과 관련된 코드는 저장소에 존재하지 않는다.

### 테스트 현황

| 프로젝트                  | 테스트                   |
| ------------------------- | ------------------------ |
| api                       | `go test ./...` 6개 통과 |
| web · mobile · commit-mcp | **러너 미설치**          |

`pnpm test`가 통과해도 web과 mobile은 검증되지 않은 상태다. 테스트할 화면 로직이 아직 없어 러너를 넣지 않았다. 첫 대상은 `apps/*/src/lib/api.ts`다.

## Next Step

공통 앱 셸과 디자인 시스템을 기반으로 실제 화면을 하나씩 기획서 순서에 맞게 구현한다.

첫 화면을 시작할 때 함께 판단할 것:

- 화면이 여러 개가 되는 시점의 mobile 네비게이션 (지금은 단일 `App.tsx`)
- 실제 데이터가 필요해지는 시점의 query/service adapter와 테스트 러너
- 브라우저가 API를 직접 불러야 하면 CORS와 `NEXT_PUBLIC_` 전환
