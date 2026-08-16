# Project — AI 이미지 액션 라우터 (snapdone)

사용자가 사진이나 스크린샷을 넣으면 내용을 파악하고 가능한 행동으로 연결하며, 반복되는 행동은 사용자의 허락 아래 자동화한다.

## 핵심 UX loop

```
Capture → Understand → Route → Act → Learn
```

## 성공 기준

성공 기준은 "AI가 분석했다"가 **아니다**. 사용자가 원래 하려던 일이 **끝난 것**이다.

화면에 남아야 하는 마지막 문장은 이런 형태다.

- 캘린더에 등록했습니다.
- 서울 맛집에 저장했습니다.
- 지출로 저장했습니다.
- 한국어로 번역했습니다.

분석 과정, 신뢰도 점수, 모델 이름은 결과가 아니다. 결과는 완료된 행동이다.

자세한 내용은 [docs/product/product-principles.md](docs/product/product-principles.md).

---

## Architecture Rules

| 위치          | 스택                             |
| ------------- | -------------------------------- |
| `apps/web`    | Next.js + TypeScript             |
| `apps/mobile` | React Native + Expo + TypeScript |
| `apps/api`    | Go                               |
| `libs/*`      | 플랫폼 중립 공유 코드            |
| `docs/*`      | 제품 · 아키텍처 문서             |

Nx가 전체 작업 orchestration을 담당한다. 그러나 **플랫폼별 정상적인 architecture를 깨뜨리면서까지 모든 코드를 공유하지 않는다.**

**공유 우선 후보 (libs로)**

- domain type
- pure business logic
- formatter
- validation
- constants
- API contract 관련 TypeScript 코드

**공유하지 않는 것이 기본**

- DOM component
- React Native component
- CSS
- browser API
- native API
- platform navigation
- platform-specific modal / sheet

새 Nx library는 **실제 재사용 가치가 생겼을 때만** 만든다. "나중에 쓸 것 같아서" 미리 만들지 않는다. 두 번째 사용처가 실제로 나타난 시점이 만들 시점이다.

구조 설명은 [docs/architecture/target-architecture.md](docs/architecture/target-architecture.md).

---

## Frontend Rules

### Web (`apps/web`)

- Next.js, **App Router 우선**
- TypeScript
- **Server Component를 기본으로 생각하고**, browser interaction이 필요한 부분만 Client Component로 내린다
- responsive layout
- semantic HTML
- 접근성 (키보드 이동, 포커스 표시, 대비, 레이블)
- 기존 component 우선 재사용

### Mobile (`apps/mobile`)

- React Native + Expo
- TypeScript
- Safe Area 준수
- 충분한 touch target
- 키보드 회피 처리
- 권한 요청은 필요한 순간에, 이유를 밝히고
- iOS / Android 양쪽 확인
- 접근성 (스크린 리더 레이블, 대비, 글자 크기 확대)
- mobile-first interaction

### 공통

**Web UI를 React Native에 그대로 복제하지 않는다.** 동일한 product experience를 각 플랫폼에 적합한 방식으로 구현한다. 같은 것은 사용자가 얻는 결과이지 화면 구조가 아니다.

---

## Backend Rules

Go backend는 **표준 Go 구조**를 유지한다.

- 초기에는 불필요한 framework를 추가하지 않는다. 표준 라이브러리로 시작한다
- 필요해지면 `handler → service/usecase → repository` 책임 분리를 쓸 수 있다
- 그러나 단순한 endpoint까지 과도하게 enterprise architecture로 만들지 않는다
- **Go project를 Nx 때문에 비정상적인 구조로 바꾸지 않는다.** Nx에는 project target을 연결해서 관리한다

---

## Dependency Rules

dependency를 설치하기 **전에** 항상 다음을 순서대로 확인하고, 그 결과를 설명한 뒤에만 설치한다.

1. 기존 dependency로 되는가
2. 표준 라이브러리로 되는가
3. 현재 platform SDK(Next.js / Expo / Go stdlib)로 되는가
4. 그래도 필요하다면 왜 필요한지 설명

**"편해서"는 설치 사유가 아니다.**

Nx plugin(`@nx/*`)은 개별 `pnpm add` 금지. `nx add` 또는 `nx migrate`만 사용한다 (버전 동기화 때문).

---

## Design Direction

이 제품은 AI를 사용하지만 **AI 서비스처럼 보이면 안 된다.**

**금지**

보라색 gradient 남발 · neon · glow · glassmorphism 남발 · robot · sparkle 장식 남발 · 우주/SF 모티프 · chat UI 중심 구성 · 의미 없는 AI badge · 기술 dashboard

**목표**

깔끔함 · 현실적 · 친숙함 · 빠름 · 신뢰감 · 절제됨 · 생활형 생산성 · 모바일 친화적 · 대한민국 서비스 친화적

**기본 locale: `ko-KR`**

사용자 UI에는 불필요한 영어 AI 개발 용어를 노출하지 않는다. "임베딩", "프롬프트", "추론", "confidence", "routing" 같은 말은 내부 용어이며 화면에 나오지 않는다.

---

## Code Modification Rules

- 수정 전 관련 파일을 **읽는다**
- 추측해서 기존 코드를 덮어쓰지 않는다
- 관계없는 refactor를 하지 않는다
- scope 밖 기능을 구현하지 않는다
- TODO만 남기고 완료를 선언하지 않는다
- unused import를 남기지 않는다
- dead code를 남기지 않는다
- TypeScript `any`를 남용하지 않는다
- console debug 출력을 남기지 않는다
- lint / typecheck / test 오류를 무시하지 않는다
- 기존 test를 깨뜨리지 않는다
- 접근성을 고려한다
- **한국어 텍스트 overflow를 고려한다** (한국어는 영어보다 길어지고 줄바꿈 규칙이 다르다)
- mobile 검증은 선택이 아니라 필수다

문제를 고칠 때는 **근본 원인을 먼저 증명하고** 고친다. 재현 → 증거 → 수정 순서를 지킨다. 추측으로 workaround를 넣지 않는다.

---

## Version Matrix (고정)

이 조합은 Preflight 환경 점검에서 확정한 것이며 임의로 올리지 않는다.

| 항목         | 버전    | 비고                                           |
| ------------ | ------- | ---------------------------------------------- |
| Node         | 24.14.0 | `.nvmrc`로 고정. 버전 매니저는 nvm 하나만 사용 |
| pnpm         | 10.30.3 | `package.json`의 `packageManager`로 고정       |
| Nx           | 23.1.1  | `nx`와 모든 `@nx/*`가 **정확히 같은 버전**     |
| Next.js      | 16.x    | `@nx/next` peer 범위 `>=14 <17`                |
| Expo SDK     | **56**  | 57 아님 — 아래 참조                            |
| React Native | 0.85.3  | Expo SDK 56이 고정                             |
| React        | 19.2.x  |                                                |
| Go           | 1.26.6  |                                                |

**Expo는 SDK 56에 고정한다.** `@nx/expo` 생성기가 아직 SDK 57을 지원하지 않는다 (nrwl/nx#36443 open). peer 범위가 `>=53`으로 느슨해 57도 설치는 되지만 생성·마이그레이션 경로가 없다. Nx가 지원을 추가하면 `nx migrate`로 올린다.

버전 변경은 개별 install이 아니라 `nx migrate`로만 한다.

---

## 작업 방식

- 작게, 점진적으로 진행하고 각 단계를 검증한 뒤 다음으로 넘어간다
- 과도한 방어적 프로그래밍을 하지 않는다
- 주석은 docstring 위주로 간결하게. 그 밖의 주석은 아껴 쓴다
- 코드 · print · 로그에 이모지를 쓰지 않는다
- 모듈 · 함수는 짧게, 이름은 분명하게
