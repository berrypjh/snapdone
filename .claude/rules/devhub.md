---
paths:
  - 'apps/devhub/**'
---

# devhub (`apps/devhub`)

저장소를 읽어 보여 주는 내부 도구다. Next.js + TypeScript, 포트 3100. **제품(api · web · mobile · libs)을 설명하고 자기 자신은 설명하지 않는다** — devhub 자신은 노드 · 문서 · 기록 · 테스트 어디에도 넣지 않는다. 설계는 [devhub.md](../../docs/architecture/devhub.md).

## 데이터가 먼저다

- 화면은 `src/data/`의 카탈로그에서만 만든다. 컴포넌트가 사실을 지어내지 않는다
- **경로 · symbol · 테스트 제목은 저장소에 실재해야 한다.** `devhub:check`(freshness)가 전부 대조하고, 어긋나면 실패한다. 없는 것을 추정으로 채우지 않는다
- 링크는 데이터에 저장하지 않는다. 저장소 레코드의 템플릿(`repository.browse`)에서 렌더할 때 만든다. 줄 번호는 사람이 적지 않는다
- 카탈로그 불변식은 검사로 지켜진다 — Nx 프로젝트 · 루트 script · `docs/` 마크다운은 **빠짐없이** 덮어야 하고(devhub 자신은 제외), 모든 테스트는 시나리오나 기록이 인용해야 한다
- **예외: 평가 결과.** `tools/evals/results`는 카탈로그가 아니라 Go가 쓰는 산출물이다. `src/lib/evaluations`가 요청마다(`localEvaluations()` → `connection()`) 읽고 v1 decoder로 검증하며, 맞았는지는 Go 값을 그대로 쓰고 TS에서 다시 채점하지 않는다. id는 식별자 규칙을 지나야 경로에 들어가고 symlink는 따라가지 않는다
- **DevHub는 관찰, notebook은 탐색.** `/evals`는 정식 run · 비교 · gate 결과와 case 증거를 보이고, 정식 run의 Go 명령 글자를 만들어 준다(`command-builder.tsx` — 저장소의 dataset · 기준선 · 실험 설정과 사용자가 적은 모델 이름으로 `pnpm eval plan/run`을 조립, 실행은 사용자 터미널). 공급자 API는 모델 목록 조회(`lib/evaluations/provider-models.ts`, 요청마다 Anthropic · OpenAI `/v1/models`)에만 쓴다 — key는 DevHub 프로세스의 `ANTHROPIC_API_KEY` · `OPENAI_API_KEY`에서만 읽고 요청 헤더에만 쓰며 화면 · 브라우저 · 파일 · 오류 문구에 싣지 않고, key가 없으면 이유만 보이고 모델은 직접 적는다. 모델을 부르는 실행은 하지 않는다. 어느 variant가 나은지 · 무엇이 나빠졌는지 · gate 통과 여부를 TS에서 정하지 않는다(그것은 `comparison.json`). 탐색 · 지시문 실험 · 임계값 조사는 `tools/evals/lab`의 notebook이 한다
- `'use client'` 코드는 `node:` 모듈에 닿지 않는다(`lib/client-imports.spec.ts`가 확인). 파일을 읽는 코드와 브라우저가 쓰는 순수 코드는 파일을 나눈다

## 폴더

```
src/domain/      타입과 순수 함수(model · links). React · URL · 커밋 없음
src/data/        curated 카탈로그. 사람이 쓰고 리뷰한다
src/lib/         catalog · search · repository · markdown · browser · evaluations(평가 산출물 읽기)
src/components/  shell · entity · source · overview · ui + architecture · canvas · doc · engineering · flow
src/app/         Next 라우트. 화면 조립만
```

## 기록 (`docs/records/`)

- 제품에서 있었던 **설계 결정 · 문제 해결 · 구현**을 한 건에 하나씩 남긴다. devhub 자신에 대한 기록은 쓰지 않는다
- 파일은 `docs/records/<YYYY-MM-DD>-<id>.md`, 첫 줄은 `# 제목` 하나. `src/data/records.ts`에 등록하지 않으면 `docs/` 전수 확인이 실패한다
- 본문은 네 절 — `상황`(문제 해결이면 `증상`) · `판단`(또는 `원인`) · `반영` · `검증`
- 설계 문서가 "지금 무엇이 맞는지"라면 기록은 "언제 · 무엇을 · 왜"다. **나중에 고쳐 쓰지 않는다.** 판단이 뒤집히면 새 기록을 쓰고 이전 기록에서 링크한다

## 화면

- 목록 · 표가 정본이고 그림은 같은 데이터의 보조 표현이다. 그림만 있는 화면을 만들지 않는다
- 비어 있으면 숨기지 않고 **이유를 쓴다**("소스 없음 — 문서에만 있음"). 빈 칸이 곧 정보다
- 아이콘은 장식(`aria-hidden`)이고 뜻은 옆의 글자가 진다. 같은 곳은 어디서나 같은 모양(`components/ui/view-icons.ts`)
- 화면 언어는 한국어. 식별자 · 경로 · 명령은 원문 그대로

## 검증

```bash
pnpm exec nx run-many -t lint typecheck test -p devhub
pnpm devhub:check          # 카탈로그 ↔ 저장소만 빠르게
```

`nx build devhub`와 dev 서버는 AI 세션에서 포트 바인딩이 막혀 실행할 수 없다. 화면 확인은 사용자에게 요청한다.
