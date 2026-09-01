---
paths:
  - 'apps/api/**'
---

# api (`apps/api`)

Go 표준 레이아웃. module은 `snapdone/api`, 진입점은 `cmd/server`.

## 구조

```
cmd/server/main.go        서버 기동 · graceful shutdown
internal/config/          환경변수 로딩
internal/httpserver/      라우터 · 핸들러
```

- **Nx 때문에 Go 관례를 바꾸지 않는다.** Nx는 `project.json`의 `nx:run-commands`로 `go` 명령을 감싸기만 한다
- 현재 endpoint는 `GET /health` 하나뿐이다. 이 규모에 `service` · `repository` · DTO 계층을 미리 만들지 않는다. 필요해지면 `handler → service → repository`로 나눈다
- 라우팅은 `http.ServeMux`의 메서드 라우팅(`"GET /health"`)을 쓴다. Gin · Echo · Chi를 넣지 않는다

## Dependency

**`go.mod`에 `require`가 하나도 없다.** 외부 의존성을 추가하려면 표준 라이브러리로 안 되는 이유를 먼저 설명하고 사용자 승인을 받는다.

## Config

프로세스 환경변수만 읽는다. **`.env` 파일을 읽지 않는다** — `.env` 파서 의존성을 넣지 않았다. 기본값은 `API_HOST=127.0.0.1` · `API_PORT=8080` · `API_ENV=development`이며 하드코딩하지 않는다.

## 응답과 로그

- **오류 응답에 내부 정보를 담지 않는다.** 스택 · 파일 경로 · SQL · 내부 식별자를 밖으로 내보내지 않는다. 클라이언트로 나가는 경로는 `writeJSON` 하나뿐이다
- **로그에 토큰 · 개인정보 · 이미지 내용을 남기지 않는다.** 이 제품의 입력은 스크린샷이고 이름 · 전화번호 · 계좌번호가 흔히 들어 있다. 현재 로그는 수명주기 이벤트뿐이다
- CORS는 **브라우저가 이 API를 직접 부르게 될 때** 넣는다. 지금은 cross-origin 주체가 없어 코드가 아예 없다. 넣게 되면 허용 origin을 설정으로 받고 dev/production을 분리하며 **production에서 `*`를 쓰지 않는다**. 판단 근거는 [data-access.md](../../docs/architecture/data-access.md)

## 검증

```
nx vet api    # go vet ./...
nx fmt api    # gofmt 위반 검사 -- 파일을 고쳐 쓰지 않는다
nx test api   # go test ./...
nx build api  # dist/apps/api/api
```

`lint` target은 없다. `fmt`가 검사만 하는 것은 CI가 소스를 바꾸면 안 되기 때문이다. 위반이 나오면 로컬에서 `gofmt -w .`로 고친다.

테스트는 `internal/*/[name]_test.go`에 같은 패키지로 둔다.
