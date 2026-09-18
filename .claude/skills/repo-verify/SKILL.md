---
name: repo-verify
description: 바뀐 파일에서 영향받는 Nx 프로젝트를 정하고, 가장 싼 검사부터 필요한 만큼만 올려가며 검증한다. 검증하지 못한 것은 그대로 보고한다.
when_to_use: Use after changing code in this repository, before reporting that work is done. Also when unsure which projects a change affects, or how far to escalate lint / typecheck / test / build.
argument-hint: '<files|project> (생략 시 git 변경분)'
---

# repo-verify

목적은 전부 돌리는 것이 아니라 **이 변경에 필요한 만큼만 돌리고, 돌리지 않은 것을 정직하게 말하는 것**이다.

## 1. 무엇이 바뀌었나

```bash
git status --porcelain
```

**내가 만든 변경과 사용자의 기존 미커밋 변경을 구분한다.** 건드리지 않은 파일을 검증 범위에 넣지 않는다.

## 2. 어떤 프로젝트가 영향받나

짐작하지 말고 Nx에게 묻는다.

```bash
nx show projects --affected --files=<바뀐 파일, 쉼표 구분>
```

이 저장소에서 실측한 매핑:

| 바꾼 파일                                     | affected                            |
| --------------------------------------------- | ----------------------------------- |
| `apps/web/**`                                 | `web`, **`web-e2e`**                |
| `apps/mobile/**`                              | `mobile`                            |
| `apps/api/**`                                 | `api`                               |
| `libs/<lib>/**`                               | `<lib>`, `web`, `mobile`, `web-e2e` |
| `apps/devhub/**`                              | `devhub`, `devhub-e2e`              |
| `apps/devhub-e2e/**`                          | `devhub-e2e`                        |
| `nx.json` · `tsconfig.base.json`              | **전부 8개**                        |
| 루트 `package.json` · `eslint.config.mjs`     | `api`를 뺀 7개                      |
| `docs/**` · `.claude/**` · `tools/scripts/**` | 없음 (`[]`)                         |

`web` 변경이 `web-e2e`까지 끌어오는 것은 `implicitDependencies` 때문이며 의도된 동작이다.

**DevHub는 affected가 모른다.** `devhub`의 catalog은 `apps/*` · `libs/*` · `docs/` · 루트 `package.json` · Nx target을 경로와 이름으로 인용하지만 Nx 의존이 아니라서, `apps/web`이나 `docs/`만 바꾸면 affected에 `devhub`가 없다. 파일을 옮기거나 지웠거나, 문서 heading · 루트 script · Nx target · export 이름을 바꿨으면 `pnpm devhub:check`를 함께 돌린다(2초 남짓, 캐시하지 않는다).

affected가 비어 있어도 `.claude/hooks/**` · `tools/scripts/**`를 고쳤으면 `pnpm test:hooks`와 `pnpm exec eslint .claude/hooks tools/scripts`를 돌린다. Nx 프로젝트가 아니라 `pnpm lint` 끝의 루트 eslint만 이 경로를 본다.

## 3. 그 프로젝트에 target이 있는지 확인한다

target 이름은 프로젝트마다 다르다.

| project                             | 있는 target                                                                  |
| ----------------------------------- | ---------------------------------------------------------------------------- |
| `web`                               | `lint` `typecheck` `test` `build`                                            |
| `mobile`                            | `lint` `typecheck` `test` — `build`는 EAS 클라우드                           |
| `api`                               | **`vet` `fmt` `test` `build` `swagger-check`** — `lint`도 `typecheck`도 없다 |
| `web-e2e`                           | `lint` `typecheck` `e2e`                                                     |
| `webview-bridge` · `auth-contracts` | `lint` `typecheck` `test`                                                    |
| `devhub`                            | `lint` `typecheck` `test` `build` `devhub-check` — test · build는 캐시 안 함 |
| `devhub-e2e`                        | `lint` `typecheck` `e2e`                                                     |

확실하지 않으면 `nx show project <이름>`으로 본다. `nx affected -t <target>`은 그 target이 없는 프로젝트를 **조용히 건너뛴다**(`No tasks were run`). 없는 target 때문에 실패하지 않으므로 target을 묶어서 넘겨도 된다.

## 4. 사다리 — 가장 싼 것부터

변경 크기에 따라 멈출 지점을 정한다. 모든 변경을 Level 5까지 올리지 않는다.

**Level 1 — 바꾼 프로젝트의 정적 검사**

```bash
nx affected -t lint,typecheck --files=<바뀐 파일>
```

한 파일 수정, 텍스트·스타일 변경이면 여기서 끝난다.

**Level 2 — 단위 테스트 추가**

```bash
nx affected -t lint,typecheck,test --files=<바뀐 파일>
```

로직을 건드렸거나 파일을 여러 개 고쳤으면 여기까지.

**Level 3 — 교차 변경**

두 앱에 걸친 쌍(`apps/*/src/lib/api.ts`)을 고쳤으면 **양쪽 앱을 모두** 범위에 넣는다. `libs/`를 고치면 affected가 양쪽 앱을 알아서 끌어온다. Go 응답 모양을 바꿨으면 `libs/auth-contracts`의 손으로 쓴 타입도 함께 본다. 디자인 토큰은 두 앱 모두 공용 라이브러리(web `@berrypjh/react-ui`, mobile `@berrypjh/react-native-ui`)가 소유해 앱 안에 짝 파일이 없다. affected는 파일 기준이라 "짝이 되는 파일을 안 고친 것"은 잡아주지 못한다.

**Level 4 — 빌드**

```bash
nx affected -t build --files=<바뀐 파일>
```

`web`의 라우팅·설정·의존성을 건드렸을 때. `mobile`은 여기서 제외된다(아래 참조).

**Level 5 — 런타임 / E2E**

```bash
pnpm e2e        # web-e2e. 브라우저 바이너리와 dev 서버가 필요하다
pnpm health     # API 연결 확인 (다른 터미널에 pnpm dev:api 필요)
```

App Shell 구조, 반응형 계약, 라우팅을 바꿨을 때만.

**대규모 변경** — `nx.json` · `tsconfig.base.json` · 루트 `package.json` · `eslint.config.mjs`를 고쳤으면 affected가 전부를 반환한다. 그때는 `pnpm verify`를 쓴다.

## 5. Go

**`apps/api/**`를 고쳤을 때만** 돈다. frontend 변경에 Go 검사를 붙이지 않는다.

```bash
nx affected -t vet,fmt,test --files=<바뀐 Go 파일>
```

`fmt`는 **검사만 하고 파일을 고쳐 쓰지 않는다.** 위반이 나오면 `apps/api`에서 `gofmt -w .`로 직접 고친다.

핸들러 · DTO · swag 주석을 바꿨으면 `nx run api:swagger`로 문서를 다시 만들고 `nx run api:swagger-check`로 확인한다. `swagger-check`는 `affected`의 묶음 target에 넣지 않았으므로 따로 돌린다.

`nx test api`는 Nx가 `apps/api/.env`(있다면)를 환경에 넣어 `internal/config` 테스트가 실패할 수 있다. 의심되면 `NX_LOAD_DOT_ENV_FILES=false`로 다시 돌려 비교한다([local-development.md](../../../docs/development/local-development.md#go-api는-env를-읽지-않는다)).

## 6. 이 환경에서 실행할 수 없는 것

돌리지 못한 것을 돌렸다고 말하지 않는다.

| 항목                               | 이유                                                                       |
| ---------------------------------- | -------------------------------------------------------------------------- |
| `pnpm e2e`, `pnpm dev:*`           | 포트 바인딩이 샌드박스에서 차단된다                                        |
| `nx build web` · `nx build devhub` | Turbopack의 PostCSS 워커가 포트를 연다. 같은 이유로 막힌다                 |
| `nx build mobile`                  | 로컬 빌드가 아니라 **EAS 클라우드 빌드**다. 로컬 번들은 `nx export mobile` |
| mobile 런타임 검증                 | 시뮬레이터 · Detox · Maestro가 없다. **수단 자체가 없다**                  |

앞의 셋은 **AI 세션에서만** 막힌다. 사용자 터미널에서는 정상 동작하므로 실행을 요청하면 된다. 마지막 하나는 이 머신에 수단 자체가 없다.

`pnpm build`는 `api`까지 통과하고 `web` · `devhub`에서 멈춘다(캐시가 있으면 `web`은 재생될 수 있지만 `devhub`는 캐시하지 않는다). "web · devhub 빌드는 확인하지 못했다"고 적고 사용자에게 요청한다. 결과를 받았으면 `.next/BUILD_ID`와 `routes-manifest.json` 존재로 성공을 확인할 수 있다.

## 7. 마지막

```bash
git diff
```

의도한 변경만 있는지 본다. 그리고 보고할 때 **무엇을 돌렸는지, 무엇을 못 돌렸는지, 왜 못 돌렸는지**를 함께 적는다.

UI를 바꿨다면 검증과 별개로 `/frontend-quality`로 제품 품질을 본다.

명령의 전체 목록과 배경은 [quality-gates.md](../../../docs/engineering/quality-gates.md).

## 보고

```
영향: <affected 프로젝트 목록> (판정 근거: nx show projects --affected --files=...)

## 실행함
- <명령> — PASS / FAIL(<요약>)

## 실행 안 함
- <명령> — <왜 불필요했는지 또는 이 환경에서 왜 불가능한지>
```

`실행 안 함`을 비워두지 않는다. 돌리지 않은 것을 적지 않으면 전부 돌린 것처럼 읽힌다.
