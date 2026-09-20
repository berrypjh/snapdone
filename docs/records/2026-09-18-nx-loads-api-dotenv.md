# Nx가 apps/api/.env를 읽어 config 테스트가 실패했다

Go API는 `.env`를 읽지 않는데 Nx가 대신 읽어 프로세스 환경에 넣는다. `internal/config` 테스트가 기본값 대신 그 값을 보고 5건이 깨졌다. 코드가 아니라 실행 경로의 문제였다.

## 증상

`pnpm verify`가 `test`에서 멈췄다. api `internal/config` 테스트 5건이 실패했는데, 그 작업에서 api 코드는 건드리지 않은 상태였다.

## 원인

- Go API는 `.env` 파서 의존성을 넣지 않았다 — **프로세스 환경변수만** 본다. 기본값은 `API_HOST=127.0.0.1` · `API_PORT=8080` · `API_ENV=development`이고, config 테스트는 그 기본값을 확인한다
- Nx는 target을 돌릴 때 프로젝트 폴더의 `.env`를 읽어 환경에 넣는다. `apps/api/.env`가 있으면 `nx test api`로 돌린 테스트만 기본값 대신 그 파일의 값을 본다
- 그래서 **같은 테스트가 실행 경로에 따라 다르게 끝났다.** Go 직접 실행은 통과, Nx 경유는 실패

`NX_LOAD_DOT_ENV_FILES=false pnpm exec nx test api`로 돌려 통과하는 것을 확인해 원인을 굳혔다. 이 한 줄이 "코드 문제인가, 실행 환경 문제인가"를 가른다.

## 고침

코드는 고치지 않았다. Nx의 동작은 정상이고 Go API의 선택도 정상이다. 대신 규칙을 문서에 못박았다.

- [로컬 개발 문서](../development/local-development.md)에 "Go API는 `.env`를 읽지 않는다 — 단, Nx가 대신 읽는다"를 적고, **값은 셸에서 export하고 `apps/api/.env`는 만들지 않는다**를 규칙으로 뒀다
- 이미 파일이 있는 머신을 위해 비교 명령(`NX_LOAD_DOT_ENV_FILES=false`)을 같은 자리에 뒀다
- 검증 절차(`/repo-verify`)에도 같은 단서를 넣어, api 테스트가 깨지면 이 가능성을 먼저 보게 했다

## 판단

`.env` 파서를 api에 넣어 Nx와 Go가 같은 파일을 보게 만드는 길도 있었다. 넣지 않았다 — 의존성 하나를 늘려 서버 기동 경로에 파일 입출력을 더하는 값에 비해, "환경변수는 셸에서 온다"는 한 줄 규칙이 싸고 서버 배포 환경과도 맞는다.

## 남은 것

이 실패는 `apps/api/.env`가 있는 머신에서만 난다. 검사로 막지는 않는다 — 그 파일의 존재 자체를 CI가 볼 일이 없고, 로컬에서는 문서와 검증 절차의 단서로 잡는다.
