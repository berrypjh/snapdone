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

## 폴더

```
src/domain/      타입과 순수 함수(model · links). React · URL · 커밋 없음
src/data/        curated 카탈로그. 사람이 쓰고 리뷰한다
src/lib/         catalog · search · repository · markdown · browser
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
