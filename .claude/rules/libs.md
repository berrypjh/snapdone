---
paths:
  - 'libs/**'
---

# libs (`libs/`)

이 규칙은 `libs/`에 파일이 생길 때만 읽힌다. 지금은 비어 있다.

## 만들 시점

**두 번째 사용처가 실제로 나타났을 때** 만든다. "나중에 쓸 것 같아서" 미리 만들지 않는다. 한 앱에서만 쓰는 동안에는 그 앱 안에 둔다.

## 들어갈 수 있는 것

domain type · pure business logic · formatter(날짜 · 금액 · 전화번호 같은 ko-KR 규칙) · validation · constants · API contract TypeScript 코드

## 들어가면 안 되는 것

DOM component · React Native component · CSS · browser API · native API · platform navigation · platform-specific modal / sheet

**한 파일이 `document`나 `react-native`를 import한다면 그것은 `libs/`에 있을 코드가 아니다.** `react-native-web`이 설치돼 있어 기술적으로는 가능하지만, 그렇게 만든 universal UI는 양쪽 플랫폼 모두에서 어색해진다.

## lib을 만들 때 함께 할 일

`nx.json`의 `@nx/enforce-module-boundaries`는 현재 `depConstraints`가 `sourceTag: "*" → onlyDependOnLibsWithTags: ["*"]`라 **아무것도 강제하지 못한다.** 첫 lib을 만들면 tag와 실제 제약을 함께 추가해서 이 규칙을 ESLint가 대신 지키게 한다.

의존 방향은 [target-architecture.md](../../docs/architecture/target-architecture.md) 기준이다. `libs/`는 어떤 app도 알지 못하고, app 사이의 직접 참조는 없다.
