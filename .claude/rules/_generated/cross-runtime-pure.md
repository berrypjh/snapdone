---
paths:
  - "libs/*/src/**"
---
<!-- berry-dev/standards format 1 | Source: berry-dev/standards/rules/cross-runtime-pure.md | Plugin: berry-dev@0.1.0 | Do not edit. Run: pnpm harness:sync -->

# 플랫폼 중립 계약 · 로직

이 경로의 코드는 여러 런타임(예: web 과 React Native)이 **함께** 쓰는 계약 · 순수 로직이다.
한 런타임의 API 가 들어오면 다른 런타임이 깨진다.

## 적용 대상 · 제외

- 적용 — 프로젝트가 `.claude/standards.json` 에서 고른, 여러 런타임이 공유하는 계약 · 로직 경로
- 제외 — 렌더러 · 앱 · UI 컴포넌트 패키지. 그 패키지들은 자기 플랫폼 API 를 정상적으로 쓴다

## 들어오지 않는 것

- DOM · React Native 타입과 API, browser · native API, CSS, 플랫폼 내비게이션
- UI 프레임워크 import(React 의 context · hook 포함). 런타임 상태는 각 렌더러가 쥔다
- 경계를 검사하는 lint 규칙이나 테스트가 있으면 그것을 따르고, 우회하거나 끄지 않는다

## 들어오는 기준

- 두 사용처가 **실제로** 같은 의미로 쓰고 있을 때만 올린다. "쓸 수 있다"가 아니라 "쓰고 있다"가 근거다
- 이름이 같다 · 순수 함수다 · 나중에 쓸 것 같다는 근거가 아니다. 어디서든 돌아가는 것과
  양쪽이 같은 의미로 쓰는 것은 다른 질문이다
- 한쪽만 쓰는 계약 · 유틸 · 키는 그 쪽 패키지에 둔다. 같은 계약 안에서도 한쪽에만 있는 키는 올리지 않는다
- 공개 계약을 바꾸기 전에 모든 사용처를 검색한다
