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
cmd/eval/main.go                 평가 harness CLI bootstrap (nx run api:eval). signal context와 종료 코드만, 명령은 internal/evalcli
internal/evalcli/                평가 CLI 명령 · flag · 출력 · 종료 코드. 데이터 계약은 evaluation이 가짐. 서버 · DB 없이 분류기를 부르고, 실제 provider 호출은 --allow-api가 있을 때만
docs/swagger/                    swag가 생성한 Swagger 2.0 (docs.go · swagger.json · swagger.yaml). 손으로 고치지 않는다
internal/config/                 환경변수 로딩 · 인증 설정 검증
internal/httpserver/             http.Server · Gin router(router.go) · middleware · DTO(dto.go) · 핸들러와 Swagger 주석
internal/database/               pgx pool · 마이그레이션 (migrations/*.sql을 embed)
internal/database/databasetest/  테스트용 격리 schema
internal/auth/                   인증 저장소 (사용자 · 세션 · grant · transaction) · 토큰 · AES-GCM · OAuth 흐름(oauth.go)
internal/google/                 Google OIDC authorize URL · token 교환 · ID token claim 검사
internal/processing/             사진 처리 작업 저장소(store.go) · 분류 계약(result.go · contract.go, 평가가 씀) · 유형 판단(typing.go) · 처리 방식 실행(action.go · receipt.go) · 제품 결과 계약(outcome.go) · 공급자(claude.go · openai.go) · 백그라운드 처리 · 재처리(processor.go)
internal/onboarding/             온보딩 진행(단계 · 사용 목적) 저장소와 저장 규칙(Validate)
internal/preference/             이미지 유형별 처리 방식(텍스트 · 영수증) 저장소. 유형마다 타입과 허용 값이 다르고 기본값은 DB 컬럼 DEFAULT
internal/evaluation/             평가 core — dataset · variant · runner · 채점 · 산출물 · 비교. internal/processing을 import하지 않고, cmd/server가 import하지 않음. 설계는 docs/architecture/agent-evaluation.md
internal/evaluation/processingadapter/  core ↔ production 분류기 다리. evalcli가 Factory를 주입
```

- **Nx 때문에 Go 관례를 바꾸지 않는다.** Nx는 `project.json`의 `nx:run-commands`로 `go` 명령을 감싸기만 한다
- endpoint 목록의 정본은 `router.go`와 `docs/swagger/`다 — `/health`, `/v1/auth/*`(OAuth · WebView 핸드오프 포함), `/v1/onboarding`, `/v1/processing-jobs`, `/v1/processing-preferences`
- **처리 방식은 유형 하나씩 바꾼다.** `PUT /v1/processing-preferences/{imageType}`은 그 유형의 컬럼만 UPDATE하고 바뀐 뒤의 전체를 돌려준다. 전체를 통째로 바꾸는 쓰기를 두지 않는다 — 오래된 화면이 다른 유형의 값을 덮어쓴다
- **온보딩 진행은 서버가 가진다.** mobile과 web이 같은 진행을 읽고 써서 어느 쪽에서든 이어 간다. **단계 순서는 서버가 강제한다** — 같은 단계를 다시 저장하거나 한 단계 앞으로만 가고(`onboarding.CanMove`), 어기면 409 `onboarding_out_of_order`다. 검사와 쓰기는 한 UPDATE 안에서 일어난다
- **사진은 저장하지 않는다.** 처리 요청은 작업만 만들고 202로 돌아가며, 처리는 백그라운드에서 끝나 결과만 `processing_jobs`에 남는다. 사진 대신 내용의 SHA-256(`image_sha256`)만 남기고 응답에 내보내지 않는다
- **처리는 분류 · 유형 판단 · 실행이다.** `Classify`(평가 계약, `DescribeContract` hash 고정)와 `TypeImage`(text · receipt · unsupported · ambiguous)를 함께 묻고, 확정된 유형이면 **요청 시점에 읽은** 사용자 처리 방식(`decide`)을 `Act`로 실행한다. 처리 방식을 읽지 못하면 기본값으로 대신하지 않고 작업을 만들지 않는다(500). 유형에 없는 처리 방식 · 계약 밖 결과는 저장하지 않고 실패다(`Completion.Validate` · DB CHECK). 분류 enum이나 지시를 바꾸면 평가 hash가 바뀌므로 제품 판단은 `typing.go`에서 바꾼다
- **재처리는 같은 POST다.** `sourceJobId`와 같은 사진을 다시 보내고 `action`(처리를 마친 작업) 또는 `imageType`(ambiguous)을 고른다. 서버가 digest로 같은 사진인지 보고, 분류는 다시 하지 않고 원래 작업의 분류 결과를 쓴다. unsupported · 실패 작업은 재처리하지 않는다(409). **재처리는 저장된 처리 방식을 바꾸지 않는다** — 기본값 저장은 클라이언트가 따로 `PUT /v1/processing-preferences/{imageType}`을 부른다
- **영수증 필드는 하나씩 확정한다.** `PATCH /v1/processing-jobs/{jobId}/receipt-fields/{field}`가 행을 잠그고 확정하지 않은 필드만 바꾼다. 같은 값이면 그대로 200, 다른 값으로 확정된 필드는 409다. 모델은 다시 부르지 않는다
- **작업의 출처(`origin`)는 서버가 정한다.** 요청 세션의 온보딩 단계가 `complete`면 `general`, 그 전이면 `onboarding`이다. 클라이언트 입력 · User-Agent로 고르지 않는다. `GET /v1/processing-jobs`는 내 `general` 작업만 최근 순(`created_at DESC, id DESC`)으로 20개까지 돌려주고, 상태는 단건 조회와 같은 규칙(`jobColumns`의 stale running → failed)으로 읽는다
- **모델은 설정으로 고른다.** `PROCESSING_PROVIDER`(`anthropic` · `openai` 호환)와 `PROCESSING_MODEL`. 모델을 바꾸려고 코드를 고치지 않는다. 모든 공급자가 같은 지시 · 결과 schema를 쓰고 `parseResult` · `parseTyping` · `actionSpec.parse`가 결과를 다시 검사한다. 새 공급자는 `Model`(`Classifier` · `Typer` · `Actor`) 구현 하나를 더한다
- 업로드는 파일 내용으로 판별한 JPEG · PNG · GIF · WebP만, 원본 7,500,000 byte까지(Claude API 이미지 상한 base64 10 MB 기준)
- **provider 토큰을 앱 · web으로 보내지 않는다.** callback은 60초 result code만 복귀 URI(서버 설정)로 redirect한다. ID token 서명 생략은 token endpoint에서 TLS로 직접 받은 경우에만 허용하고, 클라이언트가 보낸 토큰에는 쓰지 않는다
- 외부 HTTP 호출은 timeout · 응답 크기 제한 · redirect 미추적을 둔다. 테스트는 포트를 열지 않고 `http.Client.Transport`로 가짜 응답을 준다(샌드박스가 포트 바인딩을 막는다)
- **스키마 변경은 `internal/database/migrations/`에 번호를 올린 새 SQL 파일로만 한다.** 이미 적용된 파일은 고치지 않는다. 서버는 마이그레이션을 적용하지 않고, 미적용 파일이 있으면 기동을 거부한다. 적용은 `nx run api:migrate`(Nx 내장 `nx migrate`와 다르다)
- `//go:embed migrations/*.sql` 지시문을 지우지 않는다. 지우면 마이그레이션이 조용히 0개가 된다 (`embed_test.go`가 잡는다)
- 토큰 · 코드 · state는 해시로만 저장한다. 저장소 함수는 원문을 받지 않는다. 비밀 값은 `auth.Cipher`로 암호화하고 소유 행 식별자를 AAD로 쓴다

## HTTP 경계 (Gin)

- **Gin은 `internal/httpserver` 안에서만 쓴다.** `auth` · `database` · `google` · `config`와 `cmd/`는 Gin을 import하지 않고, `gin.Context`를 핸들러 밖으로 넘기지 않는다. 핸들러는 DTO를 도메인 입력(예: `auth.StartInput`)으로 직접 옮기고 도메인 오류를 상태 코드로 바꾼다
- **`net/http.Server`가 수명주기를 가진다.** timeout · graceful shutdown은 `http.Server`에 있고 Gin engine은 `Handler`일 뿐이다. `gin.Default()` · `router.Run()`을 쓰지 않는다
- route는 `router.go` 한 곳에서 `/v1` → `/auth` → `/oauth` · `/handoff` group으로 등록한다. `/health`는 `/v1` 밖이다. GET route는 `get()` helper로 HEAD도 받는다
- router 동작: 다른 메서드 405(`Allow` 포함), 없는 경로 404, trailing slash · 대소문자 · 중복 slash 교정 redirect 없음(404)
- 인증 설정이 없으면 route를 빼지 않고 `requireConfigured` middleware가 503을 돌려준다
- `/v1/auth` group 전체에 `Cache-Control: no-store` · `Referrer-Policy: no-referrer`와 4 KiB 본문 상한(`limitBody`)이 걸린다. binding(`ShouldBindJSON`)은 상한 뒤에 돈다
- binding 태그는 `binding:"required"` 정도만 쓴다. PKCE · state 모양 · next allowlist · 일회용 grant 규칙은 `internal/auth`가 판단한다. binding 실패는 endpoint의 기존 오류 코드로 400이다(422를 쓰지 않는다)
- middleware는 request ID(crypto/rand) · 요청 로그 · panic recovery · no-store · 본문 상한 · 503 · 업로드 기한 뿐이다. 새 middleware는 분명한 이유가 있을 때만 더한다
- 서버 기본 읽기 · 쓰기 기한은 15초다. **사진 업로드 route만** `extendDeadline(uploadTimeout)`(2분)으로 늘린다 — 15초면 느린 모바일 네트워크에서 7.5 MB를 다 받지 못하고 연결이 끊긴다(`server_test.go`가 재현한다). 다른 route는 늘리지 않는다
- 레이어(controller · service · repository · usecase)를 새로 만들지 않는다. 필요해지면 그때 판단한다

## Swagger

- endpoint를 추가 · 변경하면 핸들러 위에 swag 주석(`@Summary` · `@Tags` · `@Param` · `@Success` · `@Failure` · `@Router`, Bearer가 필요하면 `@Security BearerAuth`)을 달고 `nx run api:swagger`로 `docs/swagger/`를 다시 생성해 함께 커밋한다
- `nx run api:swagger-check`는 임시 디렉터리에 생성해 비교만 한다(작업 트리를 바꾸지 않는다). `swagger_test.go`는 `Engine.Routes()`와 생성 문서의 operation이 일치하는지 본다 — 주석이 없는 route가 있으면 `go test`가 실패한다
- swag는 `go.mod`의 `tool` 지시문으로 고정했다(`go tool swag`). 전역 설치 swag를 쓰지 않는다
- Swagger UI `/swagger/index.html`은 `API_ENV`가 `production`이 아닐 때만 열린다
- BearerAuth는 **opaque 세션 credential**이다. JWT라고 쓰지 않는다. 예시 값에 실제처럼 보이는 토큰 · 코드 · secret을 넣지 않는다

## Dependency

직접 의존성: `pgx/v5`(Postgres) · `gin` · `swaggo/gin-swagger` · `swaggo/files`(HTTP · Swagger UI) · `anthropic-sdk-go`(사진 분류), tool `swaggo/swag/cmd/swag`. 그 외 외부 의존성은 표준 라이브러리 · 기존 의존성으로 안 되는 이유를 먼저 설명하고 사용자 승인을 받는다. ORM · 마이그레이션 도구 · DI · 설정 · 로깅 · validation wrapper · JWT · UUID는 넣지 않는다. `go-playground/validator`는 직접 import하지 않는다.

## Config

프로세스 환경변수만 읽는다. **`.env` 파일을 읽지 않는다** — `.env` 파서 의존성을 넣지 않았다. 다만 Nx로 실행하면 Nx가 `apps/api/.env`(있다면)를 환경에 넣으므로 그 파일을 만들지 않는다(있으면 `internal/config` 테스트가 깨진다). 기본값은 `API_HOST=127.0.0.1` · `API_PORT=8080` · `API_ENV=development`이며 하드코딩하지 않는다. **`DATABASE_URL`은 기본값이 없고** 비어 있으면 서버가 기동하지 않는다. 로컬 Postgres는 `apps/api/compose.yaml`.

`AUTH_*`(이름은 `.env.example`)는 전부 비우면 인증 비활성(`/v1/auth/*` 503), 일부만 있거나 값이 잘못되면 기동을 거부한다. 설정 오류 메시지에 값을 담지 않는다. `PROCESSING_*`(이름 · 예시는 `.env.example`)를 전부 비우거나 인증이 비활성이면 사진 처리가 비활성(`/v1/processing-jobs` 503)이고, 일부만 있거나 값이 틀리면 기동을 거부한다.

## 응답과 로그

- **오류 응답에 내부 정보를 담지 않는다.** 스택 · 파일 경로 · SQL · 내부 식별자를 밖으로 내보내지 않는다. 오류 응답은 `writeError`가 만드는 `{"error": "<code>"}` 하나뿐이다
- **로그에 토큰 · 개인정보 · 이미지 내용을 남기지 않는다.** 이 제품의 입력은 스크린샷이고 이름 · 전화번호 · 계좌번호가 흔히 들어 있다. 로그는 `log/slog`(main이 만든 `*slog.Logger`를 `Deps.Logger`로 주입)이고, 수명주기 이벤트 · 요청 한 줄(request_id · method · route template · status · latency) · 인증 저장소 오류 · panic(타입 · stack만)뿐이다. 원문 URL · query · 헤더 · 본문 · panic 값은 남기지 않는다. Gin 기본 Logger · Recovery는 쓰지 않는다
- **레벨은 원인으로 고른다.** Error는 운영자가 볼 장애(저장소 · provider · 복호화)만이다. OAuth callback의 사용자 취소(`auth.ErrCancelled`)는 Info, 맞지 않는 · 이미 쓴 state(`auth.ErrInvalidCallback`)는 Warn이다(`callbackLogLevel`)
- CORS는 **브라우저가 이 API를 직접 부르게 될 때** 넣는다. 지금은 cross-origin 주체가 없어 코드가 아예 없다. 넣게 되면 허용 origin을 설정으로 받고 dev/production을 분리하며 **production에서 `*`를 쓰지 않는다**. 판단 근거는 [data-access.md](../../docs/architecture/data-access.md)

## 검증

```
nx vet api    # go vet ./...
nx fmt api    # gofmt 위반 검사 -- 파일을 고쳐 쓰지 않는다
nx test api   # go test ./...
nx build api  # dist/apps/api/api
pnpm swagger              # docs/swagger 재생성 (= nx run api:swagger)
pnpm swagger:check        # docs/swagger가 최신인지 검사 -- 파일을 고쳐 쓰지 않는다
pnpm migrate              # 마이그레이션 적용 (= nx run api:migrate, Postgres 필요)
pnpm eval:check           # 평가 harness offline 테스트 + sample dataset 3개 검증
pnpm eval <command>       # 평가 CLI (= nx run api:eval). run은 --allow-api가 있을 때만 실제 호출
```

HTTP 테스트는 `net/http/httptest`로 실제 Gin engine의 `ServeHTTP`를 부른다. 실제 `http.Server` 동작(연결 종료 · shutdown)은 `server_test.go`의 `net.Pipe` listener로 포트 없이 본다.

`lint` target은 없다. `fmt`가 검사만 하는 것은 CI가 소스를 바꾸면 안 되기 때문이다. 위반이 나오면 로컬에서 `gofmt -w .`로 고친다.

테스트는 `internal/*/[name]_test.go`에 둔다.

**DB 테스트는 `TEST_DATABASE_URL`이 있을 때만 돈다.** 없으면 skip이므로 `nx test api` 통과가 DB 검증을 뜻하지 않는다. `databasetest.MigratedPool(t)`가 테스트마다 schema를 만들고 지운다.

```
docker compose -f apps/api/compose.yaml up -d --wait
TEST_DATABASE_URL='postgres://snapdone:snapdone@127.0.0.1:5432/snapdone?sslmode=disable' go test -count=1 ./...
```
