---
paths:
  - 'apps/api/**'
---

# api (`apps/api`)

Go 표준 레이아웃. module은 `snapdone/api`, 진입점은 `cmd/server`.

## 구조

```
cmd/server/main.go               서버 기동 · 미적용 마이그레이션 시 기동 거부 · graceful shutdown · Swagger 일반 정보
cmd/migrate/main.go              마이그레이션 적용 (배포 단계에서 1회)
docs/swagger/                    swag가 생성한 Swagger 2.0 (docs.go · swagger.json · swagger.yaml). 손으로 고치지 않는다
internal/config/                 환경변수 로딩 · 인증 설정 검증
internal/httpserver/             http.Server · Gin router(router.go) · middleware · DTO(dto.go) · 핸들러와 Swagger 주석
internal/database/               pgx pool · 마이그레이션 (migrations/*.sql을 embed)
internal/database/databasetest/  테스트용 격리 schema
internal/auth/                   인증 저장소 (사용자 · 세션 · grant · transaction) · 토큰 · AES-GCM · OAuth 흐름(oauth.go)
internal/google/                 Google OIDC authorize URL · token 교환 · ID token claim 검사
```

- **Nx 때문에 Go 관례를 바꾸지 않는다.** Nx는 `project.json`의 `nx:run-commands`로 `go` 명령을 감싸기만 한다
- endpoint는 `GET /health`와 `/v1/auth/{capabilities,session,logout}`, `/v1/auth/oauth/{start,cancel,callback}` · `/v1/auth/exchange` · `/v1/auth/handoff/{start,exchange}`(WebView 핸드오프, `internal/auth/handoff.go`)이다.
- **provider 토큰을 앱 · web으로 보내지 않는다.** callback은 60초 result code만 복귀 URI(서버 설정)로 redirect한다. ID token 서명 생략은 token endpoint에서 TLS로 직접 받은 경우에만 허용하고, 클라이언트가 보낸 토큰에는 쓰지 않는다
- 외부 HTTP 호출은 timeout · 응답 크기 제한 · redirect 미추적을 둔다. 테스트는 포트를 열지 않고 `http.Client.Transport`로 가짜 응답을 준다(샌드박스가 포트 바인딩을 막는다)
- **스키마 변경은 `internal/database/migrations/`에 번호를 올린 새 SQL 파일로만 한다.** 이미 적용된 파일은 고치지 않는다. 서버는 마이그레이션을 적용하지 않고, 미적용 파일이 있으면 기동을 거부한다. 적용은 `nx run api:migrate`(Nx 내장 `nx migrate`와 다르다)
- `//go:embed migrations/*.sql` 지시문을 지우지 않는다. 지우면 마이그레이션이 조용히 0개가 된다 (`embed_test.go`가 잡는다)
- 토큰 · 코드 · state는 해시로만 저장한다. 저장소 함수는 원문을 받지 않는다. 비밀 값은 `auth.Cipher`로 암호화하고 소유 행 식별자를 AAD로 쓴다

## HTTP 경계 (Gin)

- **Gin은 `internal/httpserver` 안에서만 쓴다.** `auth` · `database` · `google` · `config`와 `cmd/`는 Gin을 import하지 않고, `gin.Context`를 핸들러 밖으로 넘기지 않는다. 핸들러는 DTO를 도메인 입력(예: `auth.StartInput`)으로 직접 옮기고 도메인 오류를 상태 코드로 바꾼다
- **`net/http.Server`가 수명주기를 가진다.** timeout · graceful shutdown은 `http.Server`에 있고 Gin engine은 `Handler`일 뿐이다. `gin.Default()` · `router.Run()`을 쓰지 않는다
- route는 `router.go` 한 곳에서 `/v1` → `/auth` → `/oauth` · `/handoff` group으로 등록한다. `/health`는 `/v1` 밖이다. GET route는 `get()` helper로 HEAD도 받는다(ServeMux 시절 동작)
- router 동작: 다른 메서드 405(`Allow` 포함), 없는 경로 404, trailing slash · 대소문자 · 중복 slash 교정 redirect 없음(404)
- 인증 설정이 없으면 route를 빼지 않고 `requireConfigured` middleware가 503을 돌려준다
- `/v1/auth` group 전체에 `Cache-Control: no-store` · `Referrer-Policy: no-referrer`와 4 KiB 본문 상한(`limitBody`)이 걸린다. binding(`ShouldBindJSON`)은 상한 뒤에 돈다
- binding 태그는 `binding:"required"` 정도만 쓴다. PKCE · state 모양 · next allowlist · 일회용 grant 규칙은 `internal/auth`가 판단한다. binding 실패는 endpoint의 기존 오류 코드로 400이다(422를 쓰지 않는다)
- middleware는 request ID(crypto/rand) · 요청 로그 · panic recovery · no-store · 본문 상한 · 503 뿐이다. 새 middleware는 분명한 이유가 있을 때만 더한다
- 레이어(controller · service · repository · usecase)를 새로 만들지 않는다. 필요해지면 그때 판단한다

## Swagger

- endpoint를 추가 · 변경하면 핸들러 위에 swag 주석(`@Summary` · `@Tags` · `@Param` · `@Success` · `@Failure` · `@Router`, Bearer가 필요하면 `@Security BearerAuth`)을 달고 `nx run api:swagger`로 `docs/swagger/`를 다시 생성해 함께 커밋한다
- `nx run api:swagger-check`는 임시 디렉터리에 생성해 비교만 한다(작업 트리를 바꾸지 않는다). `swagger_test.go`는 `Engine.Routes()`와 생성 문서의 operation이 일치하는지 본다 — 주석이 없는 route가 있으면 `go test`가 실패한다
- swag는 `go.mod`의 `tool` 지시문으로 고정했다(`go tool swag`). 전역 설치 swag를 쓰지 않는다
- Swagger UI `/swagger/index.html`은 `API_ENV`가 `production`이 아닐 때만 열린다
- BearerAuth는 **opaque 세션 credential**이다. JWT라고 쓰지 않는다. 예시 값에 실제처럼 보이는 토큰 · 코드 · secret을 넣지 않는다

## Dependency

직접 의존성: `github.com/jackc/pgx/v5`(Postgres 드라이버, 2026-09-17 승인), `github.com/gin-gonic/gin` · `github.com/swaggo/gin-swagger` · `github.com/swaggo/files`(HTTP 경계 · Swagger UI, 2026-09-18 승인), tool `github.com/swaggo/swag/cmd/swag`. 그 외 외부 의존성을 추가하려면 표준 라이브러리 · 기존 의존성으로 안 되는 이유를 먼저 설명하고 사용자 승인을 받는다. ORM · 마이그레이션 도구 · DI · 설정 · 로깅 · validation wrapper · JWT · 메일 SDK · UUID는 넣지 않았다. `go-playground/validator`는 Gin의 간접 의존성이며 직접 import하지 않는다.

## Config

프로세스 환경변수만 읽는다. **`.env` 파일을 읽지 않는다** — `.env` 파서 의존성을 넣지 않았다. 다만 Nx로 실행하면 Nx가 `apps/api/.env`(있다면)를 환경에 넣으므로 그 파일을 만들지 않는다(있으면 `internal/config` 테스트가 깨진다). 기본값은 `API_HOST=127.0.0.1` · `API_PORT=8080` · `API_ENV=development`이며 하드코딩하지 않는다. **`DATABASE_URL`은 기본값이 없고** 비어 있으면 서버가 기동하지 않는다. 로컬 Postgres는 `apps/api/compose.yaml`.

`AUTH_*`(이름은 `.env.example`)는 전부 비우면 인증 비활성(`/v1/auth/*` 503), 일부만 있거나 값이 잘못되면 기동을 거부한다. 설정 오류 메시지에 값을 담지 않는다.

## 응답과 로그

- **오류 응답에 내부 정보를 담지 않는다.** 스택 · 파일 경로 · SQL · 내부 식별자를 밖으로 내보내지 않는다. 오류 응답은 `writeError`가 만드는 `{"error": "<code>"}` 하나뿐이다
- **로그에 토큰 · 개인정보 · 이미지 내용을 남기지 않는다.** 이 제품의 입력은 스크린샷이고 이름 · 전화번호 · 계좌번호가 흔히 들어 있다. 로그는 `log/slog`(main이 만든 `*slog.Logger`를 `Deps.Logger`로 주입)이고, 수명주기 이벤트 · 요청 한 줄(request_id · method · route template · status · latency) · 인증 저장소 오류 · panic(타입 · stack만)뿐이다. 원문 URL · query · 헤더 · 본문 · panic 값은 남기지 않는다. Gin 기본 Logger · Recovery는 쓰지 않는다
- CORS는 **브라우저가 이 API를 직접 부르게 될 때** 넣는다. 지금은 cross-origin 주체가 없어 코드가 아예 없다. 넣게 되면 허용 origin을 설정으로 받고 dev/production을 분리하며 **production에서 `*`를 쓰지 않는다**. 판단 근거는 [data-access.md](../../docs/architecture/data-access.md)

## 검증

```
nx vet api    # go vet ./...
nx fmt api    # gofmt 위반 검사 -- 파일을 고쳐 쓰지 않는다
nx test api   # go test ./...
nx build api  # dist/apps/api/api
nx run api:swagger        # docs/swagger 재생성
nx run api:swagger-check  # docs/swagger가 최신인지 검사 -- 파일을 고쳐 쓰지 않는다
```

HTTP 테스트는 `net/http/httptest`로 실제 Gin engine의 `ServeHTTP`를 부른다. 실제 `http.Server` 동작(연결 종료 · shutdown)은 `server_test.go`의 `net.Pipe` listener로 포트 없이 본다.

`lint` target은 없다. `fmt`가 검사만 하는 것은 CI가 소스를 바꾸면 안 되기 때문이다. 위반이 나오면 로컬에서 `gofmt -w .`로 고친다.

테스트는 `internal/*/[name]_test.go`에 둔다.

**DB 테스트는 `TEST_DATABASE_URL`이 있을 때만 돈다.** 없으면 skip이므로 `nx test api` 통과가 DB 검증을 뜻하지 않는다. `databasetest.MigratedPool(t)`가 테스트마다 schema를 만들고 지운다.

```
docker compose -f apps/api/compose.yaml up -d --wait
TEST_DATABASE_URL='postgres://snapdone:snapdone@127.0.0.1:5432/snapdone?sslmode=disable' go test -count=1 ./...
```
