# Nx가 apps/api/.env를 읽어 config 테스트 실패

`apps/api/.env`는 Go 서버가 읽지 않는 파일. 그런데 테스트를 Nx로 돌리면 **Nx가 대신 읽어** 환경변수로 주입. 설정 테스트 5건이 기본값 대신 그 파일의 값을 보고 실패. 코드 문제가 아니라 실행 경로 문제.

## 증상

`pnpm verify`가 테스트 단계에서 중단. api 설정 테스트 5건 실패. 해당 작업에서 api 코드는 한 줄도 건드리지 않은 상태.

## 원인

두 가지가 겹침.

- **Go 서버는 환경변수만 참조.** `.env`를 읽는 코드 자체가 없음. 값이 없으면 기본값(`API_HOST=127.0.0.1` · `API_PORT=8080` · `API_ENV=development`)을 쓰고, 설정 테스트는 그 기본값을 확인
- **Nx는 target 실행 전 프로젝트 폴더의 `.env`를 읽어 환경변수로 주입.** `apps/api/.env`가 있는 머신에서는 `nx test api`로 돌린 테스트만 기본값 대신 그 파일의 값을 봄

결국 **같은 테스트가 실행 경로에 따라 갈림.** Nx로 돌리면 실패, Nx의 파일 읽기를 끄면 통과.

## 판단

선택지는 둘. api에 `.env` 파서를 넣어 Go도 같은 파일을 읽게 하거나, "환경변수는 셸에서 온다"를 규칙으로 고정하거나.

둘째를 선택. 파서는 의존성을 하나 늘리고 서버 기동마다 파일을 읽음. 얻는 것은 로컬 편의 하나뿐인데, 실제 배포 환경은 파일이 아니라 환경변수로 값을 전달. **규칙 한 줄이 더 싸고 배포 환경과도 일치.**

## 반영

코드 수정 없음. Nx의 동작도 Go API의 선택도 정상. 대신 규칙을 문서에 고정.

- 로컬 개발 문서의 [Go API는 `.env`를 읽지 않는다](../development/local-development.md#go-api는-env를-읽지-않는다)에 "단, Nx가 대신 읽는다"를 추가하고, **값은 셸에서 export · `apps/api/.env`는 만들지 않음**을 규칙으로 명시
- 이미 그 파일을 만들어 둔 경우는 규칙만으로 풀리지 않으므로 같은 줄 옆에 확인 명령을 배치 — `NX_LOAD_DOT_ENV_FILES=false`로 재실행해 통과하면 원인은 그 파일, 그래도 실패하면 코드 문제
- 검증 절차(`/repo-verify`)에도 같은 단서를 추가해 api 테스트가 깨지면 이 가능성부터 확인

## 검증

- `NX_LOAD_DOT_ENV_FILES=false pnpm exec nx test api` → 5건 통과 확인. 원인을 굳힌 것도 이 한 줄이고, 지금도 "코드 문제인가 실행 환경 문제인가"를 가르는 첫 수단
- 파일이 없는 머신에서는 재현 불가. 그래서 이 실패는 CI가 아니라 로컬에서만 발생

## 참고 사항

- **`apps/api/.env`를 만들지 않음.** Go 서버가 읽지 않아 만들어도 서버에는 무효과. Nx로 돌린 명령만 그 값을 참조
- **값은 셸에서 주입.** 반복해 쓸 값은 `export`, 한 번만 쓸 값은 명령 앞에

  ```bash
  export DATABASE_URL='postgres://snapdone:snapdone@127.0.0.1:5432/snapdone?sslmode=disable'
  API_PORT=9000 pnpm dev:api
  ```

- **`apps/api/.env.example`은 복사해서 쓰는 파일이 아니라 export할 키 목록.** 이 기록 이전부터 있던 파일이고 키 17개(`API_*` · `DATABASE_URL` · `AUTH_*` · `GOOGLE_*` · `PROCESSING_*`)가 기본값 · 설명과 함께 기재돼 있음
- **api 설정 테스트가 나만 깨지면 그 파일부터 의심.** `NX_LOAD_DOT_ENV_FILES=false`로 재실행해 통과하면 원인은 그 파일

이 실패는 파일이 있는 머신에서만 발생하므로 검사로 막지 않음. CI는 그 파일을 볼 일이 없고, 로컬에서는 문서와 검증 절차의 단서로 포착.

## 참고자료

- [Nx Environment Variables](https://nx.dev/docs/reference/environment-variables) — Nx. 태스크 실행 전 `[project-root]/.env`를 포함한 여러 env 파일을 순서대로 로드. `NX_LOAD_DOT_ENV_FILES=false`면 로드하지 않음
