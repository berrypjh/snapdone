# DevHub

저장소의 시나리오 · 구조 · 근거를 탐색하는 내부 도구(`apps/devhub`). 작업 규칙은 [`.claude/rules/devhub.md`](../../.claude/rules/devhub.md).

## 목적

- **답하는 질문** — 사용자 흐름 하나가 어떤 코드 · API · 계약 · 문서 · 테스트로 동작하는가
- **읽는 사람** — 이 저장소에서 일하는 개발자 · 리뷰어 · AI 에이전트
- **성공 기준** — 화면의 모든 상태 표시에서 근거까지 한 번에 이동

## 하지 않는 것

- **제품 화면 아님** — 최종 사용자 · 앱 WebView에 노출하지 않음
- **코드 검색 엔진 아님** — 상태를 코드에서 자동 추론하지 않음
- **문서 대체 아님** — `docs/`는 근거로 링크만 함
- **테스트 실행기 아님** — 테스트 · CI를 대신 돌리지 않음
- **화면 편집 없음** — 데이터 변경은 PR 리뷰를 거침

## 카탈로그

사람이 쓰고 리뷰하는 데이터(`apps/devhub/src/data/`). 타입은 `src/domain/model.ts`.

- **시나리오** — 사용자 흐름 하나. 단계마다 런타임 · 소유 프로젝트 · 상태 · 근거(소스 · API · 계약 · 테스트 · 문서)
- **구분(track)** — `current`(사용자 흐름) · `developer`(개발자가 저장소 안에서 돌리는 흐름, 평가 harness 등)
- **구성 요소** — Nx 프로젝트(application · library)와 외부 시스템
- **관계** — Nx 의존 · 런타임 호출(page 요청 · HTTP · WebView · bridge 메시지 · 저장) · 검증
- **API · 계약** — Go route와 `libs/`의 wire 타입 · WebView 메시지
- **문서 · 기록** — `docs/**/*.md` 전부. 기록은 `docs/records/`
- **테스트** — 시나리오나 기록이 인용한 테스트. 러너마다 식별 방식이 다름(Go는 함수 이름, Vitest · Playwright는 제목)
- **ID** — 영어 kebab-case로 내용을 말함. URL에 쓰이므로 공개 뒤 바꾸지 않음. 화면 기획서의 화면 ID · 기능 코드는 쓰지 않음

## 상태

- **`implemented`** — 단계마다 소스가 있음
- **`partial`** — 소스가 있지만 근거 공백(`EvidenceGap`)이 함께 있음
- **시나리오 상태** — 단계 상태에서 파생. 모든 단계가 `implemented`일 때만 `implemented`
- **검증 수준** — 상태에 섞지 않음. `TestRef.requires`(`database` · `port-binding` · `browser-binaries`)와 시나리오의 공백(실기기 · 실제 외부 서비스 · 설정 필요)으로 표시
- **상태는 사람이 정함** — 모순은 검사가 막음

## 화면

- **섹션** — 개요 · 시나리오 · 아키텍처 · 애플리케이션 · 라이브러리 · 문서 · 기록 · 평가(`/evals`), 파일 하나는 `/source?path=…`
- **상세 정보** — parallel route 슬롯 `@inspector`. 섹션 순서 고정, 비어 있으면 숨기지 않고 이유를 씀
- **목록이 정본** — 그림(아키텍처 · 단계 흐름)은 같은 데이터의 보조 표현. 노드는 단계 · 구성 요소 URL로 가는 링크, pan · zoom · "크게 보기"(`<dialog>`)
- **배치** — 렌더할 때 데이터에서 계산. 좌표를 데이터에 두지 않음
- **평가 화면** — 관찰만. 판정 · 채점은 Go 산출물 값을 그대로 씀
- **공용 UI** — 일반 개발 도구 UI는 `@berrypjh/devhub-ui`. 이 앱은 무엇을 보여 줄지만 가짐

## 접근성

- **글자 라벨** — 상태는 색 · 아이콘이 아니라 글자로 전달
- **landmark** — `header` · `nav` · `main` · 상세 정보 `aside`. 건너뛰기 링크는 루트 layout `<body>` 맨 앞
- **포커스** — 이동 뒤 본문 머리로. 다른 레이아웃으로 이동해 포커스가 `body`에 남으면 `NavigationFocus` 자리로
- **화면 폭** — 320px에서 가로 스크롤 없음. "이 페이지에서" 목차는 본문 폭(컨테이너 쿼리) 기준으로 옆 열 또는 접힌 목록
- **기타** — 모션 없음, 터치 타깃 44px, 라이트/다크 토큰은 web과 같음

## 소스 링크

- **`SourceRef`** — 저장소 상대 POSIX 경로 + 선택 symbol. 저장소가 하나라 `repository` 필드 없음
- **경로 판정** — `domain/links.ts`의 `isCanonicalPath` 한 곳. 절대 경로 · 저장소 밖 `..` · 역슬래시 · 제어 문자 · URL · 앵커 거부
- **symbol** — 그 파일에 글자 그대로 있는 식별자. Go 메서드만 `Type.method`
- **줄 번호 · URL을 데이터에 쓰지 않음** — 링크는 `RepositoryRef` 템플릿 + 스냅샷 commit + 인코딩된 경로로 렌더할 때 만듦
- **로컬 에디터 링크** — 개발 서버(`NODE_ENV=development`)에서만. 에디터는 `DEVHUB_EDITOR`로 선택

## 데이터 소유

- **curated** — `src/data/`. 사람 · AI 에이전트가 쓰고 리뷰 후 커밋
- **저장소 사실** — 별도 생성 파일 없음. 검사가 manifest · `swagger.json` · `nx graph --file`을 직접 읽음
- **평가 결과** — `tools/evals/results`는 Go 산출물. 요청마다 읽고 v1 decoder로 검증
- **범위** — 카탈로그는 제품만 담음. `devhub` · `devhub-e2e`와 이 문서는 어디에도 없음(`test-support/scope.ts`)
- **다른 앱 import 없음** — 빌드 시 `fs`로 읽음. 새 공유 library를 만들지 않음

## 검사 규칙

`nx test devhub`의 Vitest가 카탈로그와 저장소를 대조함. `pnpm devhub:check`는 그중 빠른 묶음.

| 묶음           | 규칙                                                                                                                                   |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| schema · graph | 컬렉션별 id 유일, 관계 양 끝 · `next` · `via` · runtime · owner · API · 계약 · 테스트 · 문서 id 존재                                   |
| 파일           | 인용한 모든 경로가 정규 경로이고 디스크에 있음. `docs/**/*.md`는 빠짐없이 catalog에 있음                                               |
| 문서           | 인용한 heading이 글자 그대로 있음. 문서 · 기록의 링크 · 앵커 · 파일이 실제로 있음                                                      |
| Nx project     | Nx가 보는 project = catalog project. manifest 의존 = catalog의 Nx 의존 관계. 루트 script가 부르는 target이 있음                        |
| 시나리오       | 상태가 단계 근거와 맞음, 구현된 시나리오는 테스트 ≥ 1, 모든 테스트는 시나리오나 기록이 인용. 단계 소스에 테스트 · 문서 · e2e 파일 금지 |
| API · 계약     | 항상 노출되는 route = 생성된 Swagger, 경로 변수는 호출 코드의 placeholder와 맞춤. 계약 이름이 정의 파일에 있음                         |
| 링크 · 스냅샷  | 데이터에 URL · SHA · `#L` 없음. 스냅샷은 env → git → unavailable, 실패 시 가짜 SHA 없음                                                |
| 소스 파일      | `apps/devhub*`에 날 제어 문자 없음 — 있으면 git이 바이너리로 봄                                                                        |

## 실행

- **포트 3100 고정** — `dev` · `start` · `serve-static`. web(3000)과 함께 떠도 충돌 없음
- **`test` · `build` · `devhub-check`는 `cache: false`** — 저장소 전체와 git 스냅샷을 읽어 Nx inputs로 표현되지 않음
- **AI 세션 제약** — `nx build devhub` · dev 서버는 포트 바인딩이 막혀 사용자 터미널에서 실행

## 알려진 한계

- **symbol 검사는 글자 검사** — 주석 · 문자열의 같은 단어도 통과, 재export 선언은 실패
- **검사가 한 방향** — 인용한 것이 사라지면 잡지만 catalog이 모르는 새 소스 · 테스트 · route는 못 잡음. Nx project · manifest 의존 · `docs/**/*.md` · Swagger route만 양방향
- **`nx affected`가 DevHub를 모름** — 인용된 파일을 바꿨으면 `pnpm devhub:check`를 따로 실행
- **`next build`는 검사를 돌리지 않음** — `nx build devhub`만으로는 검사 없이 빌드됨
- **`next dev`는 스냅샷을 한 번 읽음** — 커밋 뒤에는 다시 띄워야 새 SHA가 보임
- **저장소가 private** — permalink는 권한 있는 로그인 세션에서만 열림

## 검증 명령

```bash
pnpm exec nx run-many -t lint typecheck test -p devhub
pnpm devhub:check
(cd apps/devhub-e2e && pnpm exec playwright test --list)
```
