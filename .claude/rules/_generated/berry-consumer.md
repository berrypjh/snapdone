---
paths:
  - "apps/web/src/**"
  - "apps/mobile/src/**"
  - "apps/devhub/src/**"
---
<!-- berry-dev/standards format 1 | Source: berry-dev/standards/rules/berry-consumer.md | Plugin: berry-dev@0.1.0 | Do not edit. Run: pnpm harness:sync -->

# `@berrypjh` UI 패키지 소비

이 경로의 코드는 `@berrypjh/react-ui` · `@berrypjh/react-native-ui` 를 **설치된 패키지로** 쓴다.
정확한 API · prop · 토큰은 패키지가 가진 문서와 CLI 가 정답이고, 여기에 목록을 옮겨 적지 않는다.

## 적용 대상 · 제외

- 적용 — 프로젝트가 `.claude/standards.json` 에서 고른, 패키지를 소비하는 앱 코드 경로
- 제외 — 패키지 자체를 만드는 작업(maintainer). 그때는 그 패키지의 `AGENTS.md` 를 따른다

## import

- UI 패키지는 설치된 공개 패키지와 그 `exports` 경로로만 import 한다(루트 · `styles.css` · `tailwind` 등, 목록은 패키지 `package.json`)
- private 패키지(`@berrypjh/ui-core` · `@berrypjh/design-tokens`), 패키지의 `src` · `dist` 내부 경로는 import 하지 않는다.
  필요한 토큰 · 유틸은 플랫폼 패키지가 다시 내보낸다

## 조회 순서

넓은 것부터 좁힌다. 위 단계로 답이 나오면 아래로 내려가지 않는다.

1. 플랫폼 — 설치된 `@berrypjh` UI 패키지가 가장 먼저 볼 근거다. 요구와 설치 상태가 어긋나면 추측하지 않고 묻는다
2. 사용 규칙 · 함정 — 설치된 패키지의 `agents` export(`dist/AGENTS.md`)
3. 후보 심볼 · 정확한 prop · 토큰 — 설치된 패키지의 bin(`berry-react-ui` · `berry-react-native-ui`)의 `find` · `api` · `token`
4. 상속 prop 이 필요할 때만 패키지의 공개 타입 선언

- 설치된 버전의 bin 을 프로젝트 패키지 매니저로 실행한다. 레지스트리에서 다른 버전을 받아 올 수 있는 실행은 쓰지 않는다
- 토큰 파일 · 카탈로그 전체를 컨텍스트에 넣지 않는다. 필요한 경로만 조회한다

## 없을 때

- 조회 결과가 비어 있는 것은 source 를 복사하거나 비슷한 컴포넌트를 로컬에 다시 만들 이유가 아니다
- 없는 API 는 없다고 보고한다. 패키지 변경이 필요하면 소비 코드에서 우회하지 말고 패키지 쪽 작업으로 분리한다
- 패키지 구현을 읽는 것은 사용자가 upstream 동작 · 버그 조사를 명시적으로 요청했을 때의 마지막 단계다.
  그때도 읽은 코드를 소비 코드로 복사하거나 내부 경로를 import 하지 않는다
