---
paths:
  - 'apps/api/**'
---

# api (`apps/api`)

Go 표준 레이아웃. module은 `snapdone/api`, 진입점은 `cmd/server`.

## 구조

```
cmd/server/main.go               서버 기동 · 미적용 마이그레이션 시 기동 거부 · graceful shutdown
cmd/migrate/main.go              마이그레이션 적용 (배포 단계에서 1회)
internal/config/                 환경변수 로딩 · 인증 설정 검증
internal/httpserver/             라우터 · 핸들러
internal/database/               pgx pool · 마이그레이션 (migrations/*.sql을 embed)
internal/database/databasetest/  테스트용 격리 schema
internal/auth/                   인증 저장소 (사용자 · 세션 · grant · transaction) · 토큰 · AES-GCM · OAuth 흐름(oauth.go)
internal/google/                 Google OIDC authorize URL · token 교환 · ID token claim 검사
```

- **Nx 때문에 Go 관례를 바꾸지 않는다.** Nx는 `project.json`의 `nx:run-commands`로 `go` 명령을 감싸기만 한다
- endpoint는 `GET /health`와 `/v1/auth/{capabilities,session,logout}`, `/v1/auth/oauth/{start,cancel,callback}` · `/v1/auth/exchange`이다.
- **provider 토큰을 앱 · web으로 보내지 않는다.** callback은 60초 result code만 복귀 URI(서버 설정)로 redirect한다. ID token 서명 생략은 token endpoint에서 TLS로 직접 받은 경우에만 허용하고, 클라이언트가 보낸 토큰에는 쓰지 않는다
- 외부 HTTP 호출은 timeout · 응답 크기 제한 · redirect 미추적을 둔다. 테스트는 포트를 열지 않고 `http.Client.Transport`로 가짜 응답을 준다(샌드박스가 포트 바인딩을 막는다) 계약은 [api-contract.md](../../docs/features/on01/api-contract.md). DTO 계층을 미리 만들지 않는다. 필요해지면 `handler → service → repository`로 나눈다
- **스키마 변경은 `internal/database/migrations/`에 번호를 올린 새 SQL 파일로만 한다.** 이미 적용된 파일은 고치지 않는다. 서버는 마이그레이션을 적용하지 않고, 미적용 파일이 있으면 기동을 거부한다. 적용은 `nx run api:migrate`(Nx 내장 `nx migrate`와 다르다)
- `//go:embed migrations/*.sql` 지시문을 지우지 않는다. 지우면 마이그레이션이 조용히 0개가 된다 (`embed_test.go`가 잡는다)
- 토큰 · 코드 · state는 해시로만 저장한다. 저장소 함수는 원문을 받지 않는다. 비밀 값은 `auth.Cipher`로 암호화하고 소유 행 식별자를 AAD로 쓴다
- 라우팅은 `http.ServeMux`의 메서드 라우팅(`"GET /health"`)을 쓴다. Gin · Echo · Chi를 넣지 않는다

## Dependency

**직접 의존성은 `github.com/jackc/pgx/v5` 하나다** (Postgres 드라이버, 2026-09-17 승인). 그 외 외부 의존성을 추가하려면 표준 라이브러리로 안 되는 이유를 먼저 설명하고 사용자 승인을 받는다. 마이그레이션 도구 · JWT · 메일 SDK는 넣지 않았다 ([dependencies.md](../../docs/features/on01/dependencies.md)).

## Config

프로세스 환경변수만 읽는다. **`.env` 파일을 읽지 않는다** — `.env` 파서 의존성을 넣지 않았다. 기본값은 `API_HOST=127.0.0.1` · `API_PORT=8080` · `API_ENV=development`이며 하드코딩하지 않는다. **`DATABASE_URL`은 기본값이 없고** 비어 있으면 서버가 기동하지 않는다. 로컬 Postgres는 `apps/api/compose.yaml`.

`AUTH_*`(이름은 `.env.example`)는 전부 비우면 인증 비활성(`/v1/auth/*` 503), 일부만 있거나 값이 잘못되면 기동을 거부한다. 설정 오류 메시지에 값을 담지 않는다.

## 응답과 로그

- **오류 응답에 내부 정보를 담지 않는다.** 스택 · 파일 경로 · SQL · 내부 식별자를 밖으로 내보내지 않는다. 클라이언트로 나가는 경로는 `writeJSON` 하나뿐이다
- **로그에 토큰 · 개인정보 · 이미지 내용을 남기지 않는다.** 이 제품의 입력은 스크린샷이고 이름 · 전화번호 · 계좌번호가 흔히 들어 있다. 현재 로그는 수명주기 이벤트와 인증 저장소 오류(요청 헤더 · 토큰 없이)뿐이다
- CORS는 **브라우저가 이 API를 직접 부르게 될 때** 넣는다. 지금은 cross-origin 주체가 없어 코드가 아예 없다. 넣게 되면 허용 origin을 설정으로 받고 dev/production을 분리하며 **production에서 `*`를 쓰지 않는다**. 판단 근거는 [data-access.md](../../docs/architecture/data-access.md)

## 검증

```
nx vet api    # go vet ./...
nx fmt api    # gofmt 위반 검사 -- 파일을 고쳐 쓰지 않는다
nx test api   # go test ./...
nx build api  # dist/apps/api/api
```

`lint` target은 없다. `fmt`가 검사만 하는 것은 CI가 소스를 바꾸면 안 되기 때문이다. 위반이 나오면 로컬에서 `gofmt -w .`로 고친다.

테스트는 `internal/*/[name]_test.go`에 둔다.

**DB 테스트는 `TEST_DATABASE_URL`이 있을 때만 돈다.** 없으면 skip이므로 `nx test api` 통과가 DB 검증을 뜻하지 않는다. `databasetest.MigratedPool(t)`가 테스트마다 schema를 만들고 지운다.

```
docker compose -f apps/api/compose.yaml up -d --wait
TEST_DATABASE_URL='postgres://snapdone:snapdone@127.0.0.1:5432/snapdone?sslmode=disable' go test -count=1 ./...
```
