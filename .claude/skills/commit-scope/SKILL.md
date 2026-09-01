---
name: commit-scope
description: staged 변경을 scope별로 분석하고 Conventional Commits 형식의 한국어 커밋 메시지를 제안한 뒤, 승인 후 scope별로 커밋한다.
when_to_use: Use when the user wants to create commit messages for staged git changes, especially when multiple apps/libs scopes are staged together.
argument-hint: [optional-scope]
disable-model-invocation: true
---

# Commit Scope

이 skill은 현재 프로젝트에 연결된 `commit-mcp` MCP 서버를 사용한다.

참고 기준 문서:

- `.claude/skills/commit-scope/examples/commit-message-rules.md`

## 목적

현재 staged 변경을 분석해서:

1. scope를 감지하고
2. scope별 Conventional Commits 메시지를 제안하고
3. 사용자 승인 후
4. 해당 scope만 커밋한다.

## 입력 인자

- `$ARGUMENTS`가 비어 있으면: 모든 staged scope를 처리한다.
- `$ARGUMENTS`에 scope가 있으면: 해당 scope만 처리한다.
  - 예: `/commit-scope web`
  - 예: `/commit-scope mobile`

## 반드시 지킬 절차

1. 먼저 `list_staged_scopes` tool을 호출한다.
2. staged scope가 없으면 그 사실을 알려주고 바로 종료한다.
3. `$ARGUMENTS`가 있으면 그 값과 정확히 일치하는 scope만 대상으로 삼는다.
   - 해당 scope가 없으면 존재하는 scope 목록을 보여주고 종료한다.
4. 각 대상 scope마다 `get_scope_details` tool을 호출한다.
5. 각 scope에 대해 커밋 메시지를 제안한다.
   - title 형식: `type(scope): 설명`
   - type은 영어 (`feat`, `fix`, `refactor`, `docs`, `design`, `style`, `test`, `chore`, `build`, `ci`, `revert`)
   - `feat!:` 등 `!:` 표기는 금지 (Major 변경은 Footer의 `BREAKING CHANGE`로 표기)
   - scope는 MCP가 반환한 값 그대로 사용한다
   - 설명은 한국어로 작성한다
   - body는 최대 3줄
   - rename / delete / copy / 공통화 / 구조 정리가 핵심이면 body에서 반드시 언급한다
6. 반드시 사용자 승인 후에만 `commit_scope` tool을 호출한다.
   - 승인 전에는 절대 커밋하지 않는다.
7. 여러 scope가 있으면 한 번에 전부 commit하지 말고, scope별로 순서대로 승인받고 진행한다.
8. 사용자가 수정 요청을 하면 수정된 제목/본문으로 다시 제안한 뒤 승인받는다.
9. tool 실행이 실패하면 stderr/에러를 요약해서 보여주고, 다음 scope로 넘어갈지 중단할지 사용자 의사를 확인한다.

## 응답 방식

각 scope마다 아래 형식으로 보여준다.

### scope: <scope>

**제안 제목**
`type(scope): 설명`

**제안 본문**

- 첫 줄
- 둘째 줄
- 셋째 줄

**판단 근거**

- 어떤 변경이 핵심인지 1~3줄 요약

그 다음 아래처럼 묻는다.

- `y`: 이 메시지로 커밋
- `e`: 제목/본문 수정 후 다시 제안
- `s`: 이 scope는 건너뛰기
- `n`: 전체 중단

## 추가 규칙

- diff에 없는 내용을 지어내지 않는다.
- 불확실하면 과장된 `feat` 대신 보수적으로 `refactor` 또는 `chore`를 선택한다.
- body가 불필요하면 비워도 되지만, rename/refactor 성격이 강하면 body를 넣는다.
- 사용자가 "본문 없이"를 원하면 title만 사용한다.
- 사용자가 여러 scope를 한 번에 묶어달라고 명시하지 않은 이상, scope별 개별 커밋을 유지한다.
