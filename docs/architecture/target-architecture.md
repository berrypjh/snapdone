# Target Architecture

## 목표 구조

```
Nx Workspace (repository root)
├─ apps/web      Next.js + TypeScript
├─ apps/mobile   React Native + Expo + TypeScript
├─ apps/api      Go
├─ libs/         플랫폼 중립 공유 코드
└─ docs/         제품 · 아키텍처 문서
```

## 현재 상태

| 영역          | 상태                                        |
| ------------- | ------------------------------------------- |
| Nx workspace  | integrated, pnpm workspaces                 |
| `apps/web`    | Next.js App Router. 부트스트랩 화면 하나    |
| `apps/mobile` | Expo. 부트스트랩 화면 하나                  |
| `apps/api`    | module `snapdone/api`, `GET /health`만 존재 |
| `libs/`       | 비어 있음 (의도된 상태)                     |
| `docs/`       | 제품 · 아키텍처 · 디자인 · 개발 · 품질      |

버전은 아래 [버전 정책](#버전-정책)에 한 곳으로 모아 두었다.

프로젝트 목록과 각 프로젝트의 실제 target은 `nx show projects` · `nx show project <이름>`이 기준이다. 이 문서에 목록을 박아두지 않는다.

실행·검증 명령은 [docs/development/local-development.md](../development/local-development.md).

### 무엇이 있고 무엇이 없는가

**지금 있는 것은 인프라와 부트스트랩뿐이다.** 제품 기능은 하나도 구현되지 않았다.

구현된 것:

- Nx monorepo와 세 앱의 골격
- 앱별 부트스트랩 화면 (서비스명 + 소개 문구 + 상태 문구)
- 디자인 토큰과 App Shell
- Go `GET /health` 하나
- 검증 명령과 문서

아직 구현하지 않은 것:

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

**이 목록은 "예정"이 아니라 "없음"이다.** 위 기능과 관련된 코드는 저장소에 존재하지 않는다.

다음 단계는 공통 앱 셸과 디자인 시스템 위에 실제 화면을 기획서 순서대로 하나씩 올리는 것이다. 테스트가 어디까지 덮고 있는지는 [quality-gates.md](../engineering/quality-gates.md).

## 각 영역의 책임

### `apps/web` — Next.js

브라우저에서의 제품 경험 전체를 담당한다.

- 라우팅, 페이지 구성, 데이터 페칭 (App Router)
- 서버에서 할 수 있는 일은 Server Component에서 한다
- 브라우저 상호작용이 필요한 부분만 Client Component
- 웹 고유의 입력 경로 — 파일 선택, 드래그 앤 드롭, 붙여넣기

담지 않는 것: 웹 전용이 아닌 도메인 규칙과 검증 로직을 웹에 묶어두는 일. 아직 web에서만 쓰는 동안에는 web 안에 두고, mobile에서도 필요해지는 시점에 `libs/`로 올린다.

### `apps/mobile` — React Native + Expo

모바일에서의 제품 경험 전체를 담당한다.

- 네이티브 입력 경로 — 카메라, 사진 라이브러리, 공유 시트
- 권한 요청과 그 실패 처리
- 플랫폼 네비게이션, 시트, 알림
- Safe Area, 키보드, 접근성

담지 않는 것: web과 동일한 화면 구조를 억지로 맞추는 일. 결과는 같고 구현은 각자에 맞게 한다.

**네비게이션은 아직 없다.** 지금은 단일 `src/app/App.tsx`다. 화면이 여러 개가 되는 시점에 bottom navigation을 넣을지 판단한다. 가짜 탭을 미리 만들지 않는다 ([foundation.md](../design/foundation.md)의 Mobile Shell).

### `apps/api` — Go

서버 로직과 외부 연동을 담당한다.

- 이미지 처리 파이프라인 진입점
- 모델 호출과 그 결과의 정규화
- 외부 서비스 연동 (캘린더, 저장소 등)
- 인증, 저장, 사용자 데이터

**표준 Go 프로젝트 구조를 유지한다.** Nx에 맞추려고 Go 관례를 벗어난 배치를 하지 않는다. Nx에는 target을 연결해 `build` · `test` · `lint`를 orchestration에 참여시킨다.

**Nx 연결 방식 (결정 완료):** 서드파티 Go 플러그인을 쓰지 않고 `apps/api/project.json`의 `nx:run-commands` target으로 연결한다. Nx에 first-party Go 플러그인이 없고, 서드파티를 넣으면 Go 관례를 플러그인 규약에 맞춰 변형해야 하기 때문이다. Nx는 `go` 명령을 감싸기만 하고 Go 쪽 구조에는 관여하지 않는다.

**Go module path (결정 완료):** `snapdone/api`.

git remote가 없고 조직명도 정해지지 않았으므로 `github.com/...` 주소를 임의로 확정하지 않았다. 도메인이 없는 module path는 외부에서 `go get`으로 가져갈 수 없는데, 지금 단계에서는 그게 맞는 상태다. 저장소 이름 `snapdone`, npm scope `@snapdone/`과 같은 이름을 쓴다.

배포 대상이 정해지고 remote가 생기면 그때 `go mod edit -module <새 경로>`로 한 번에 바꾼다. 내부 import 경로가 함께 바뀌므로 미루지 말고 remote 확정 시점에 처리한다.

**빌드 산출물:** `dist/apps/api/api`. 소스 디렉터리에 바이너리를 남기지 않으며 `dist/`는 git ignore 대상이다.

### `libs/` — 공유 코드

**지금은 비어 있고, 그대로 두는 것이 맞다.**

라이브러리는 재사용이 실제로 발생한 뒤에 만든다. 두 번째 사용처가 나타나기 전에는 코드를 쓰는 앱 안에 둔다.

**들어올 수 있는 것**

- domain type
- pure business logic
- formatter (날짜, 금액, 전화번호 — ko-KR 규칙)
- validation
- constants
- API contract 관련 TypeScript 코드

**들어오면 안 되는 것**

- DOM component, React Native component
- CSS, 스타일 시스템
- browser API, native API 접근
- platform navigation
- platform-specific modal / sheet

한 파일이 `document`나 `react-native`를 import한다면 그것은 `libs/`에 있을 코드가 아니다.

이 문서에 미래 라이브러리 이름을 미리 나열하지 않는다. 만들어질 때 이름이 정해진다.

### `docs/` — 문서

- `docs/product/` — 제품 판단 기준
- `docs/architecture/` — 구조와 경계

구현 결정이 문서와 어긋나면 둘 중 하나를 고친다. 어긋난 채로 두지 않는다.

## 의존 방향

```
apps/web ─┐
          ├─→ libs/*        (허용)
apps/mobile ┘

libs/* ─→ apps/*            (금지)
libs/* ─→ libs/*            (순환 금지)

apps/web ─→ apps/mobile     (금지)
apps/mobile ─→ apps/web     (금지)
```

- `libs/`는 어떤 app도 알지 못한다
- app 사이의 직접 참조는 없다. 공유가 필요하면 `libs/`로 올린다
- `apps/api`는 Go이므로 TypeScript `libs/`를 코드로 공유하지 않는다

## Web · Mobile · API 사이의 계약

`apps/api`(Go)와 TypeScript 앱들은 언어가 다르므로 타입을 직접 공유할 수 없다. 계약은 생성되거나 명시적으로 선언되어야 한다.

현재 endpoint는 `GET /health` 하나뿐이라 각 앱에 작은 타입을 손으로 두었다. endpoint가 늘어나 손으로 베껴 쓰는 파일이 여러 개 생기는 시점이 생성 전략을 도입할 때다.

호출 경로와 CORS 판단, 그리고 앞으로의 adapter 규칙은 [data-access.md](./data-access.md)에 있다.

## Nx가 담당하는 것

- project graph와 의존 관계 파악
- 태스크 캐싱
- 세 앱에 걸친 `build` · `test` · `lint` 일관 실행

`nx affected`는 아직 쓰지 않는다. CI가 없어 기준 커밋을 잡을 곳이 없고, 스크립트는 전부 `nx run-many`다. CI가 생기면 base SHA를 "main의 마지막 성공 커밋"으로 두고 도입한다.

Nx는 orchestration 계층이다. 각 플랫폼의 빌드 도구(Next.js, Expo, Go toolchain)를 대체하지 않는다.

## 버전 정책

아래는 전부 실제 설치된 것을 읽은 값이다.

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
| Vitest       | 4.1.10                            |
| Playwright   | 1.62.1                            |

`nx`와 모든 `@nx/*` 플러그인은 **정확히 같은 버전**이어야 한다. 플러그인 dependency가 exact pin이라 하나만 어긋나면 중복 설치와 그래프 오류가 난다.

**Expo는 SDK 56에 고정한다.** `@nx/expo`가 아직 SDK 57을 생성·마이그레이션하지 못한다 (nrwl/nx#36443 open).

버전 변경은 `nx migrate`로만 한다. 개별 `pnpm add`로 올리지 않는다.
