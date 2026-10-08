# Local Development

## Requirements

| 도구 | 버전    | 확인                                     |
| ---- | ------- | ---------------------------------------- |
| Node | 24.14.0 | `.nvmrc`로 고정. `nvm use`               |
| pnpm | 10.30.3 | `package.json`의 `packageManager`로 고정 |
| Go   | 1.26.6  | `go version`                             |

모바일을 기기 · 시뮬레이터에서 직접 실행할 때만 추가로 필요함. Expo Go로 실기기에서 볼 때는 둘 다 불필요

| 대상               | 필요한 것                                                  |
| ------------------ | ---------------------------------------------------------- |
| iOS 시뮬레이터     | full Xcode **26.4 이상** (Command Line Tools만으로는 불가) |
| Android 에뮬레이터 | JDK, Android SDK, `ANDROID_HOME`                           |

## Install

lint · format · tsconfig · commitlint 설정은 GitHub Packages의 `@berrypjh/*` 패키지라 토큰이 필요함. `.npmrc`가 이 변수를 읽고, 없으면 `pnpm install`이 401로 실패함

```bash
export GITHUB_TOKEN=<read:packages 권한이 있는 PAT>
```

```bash
nvm use
pnpm install
```

- **husky** — `prepare` 스크립트가 설치해 `.husky/` 훅 활성화
- **Go 모듈** — `go.mod`에 고정, 첫 `go` 명령이 받음

## 실행

각 앱은 별도 터미널에서 띄움

```bash
pnpm dev:web      # Next.js  → http://localhost:3000
pnpm dev:api      # Go API   → http://127.0.0.1:8080
pnpm dev:mobile   # Expo (Metro 개발 서버)
pnpm dev:devhub    # DevHub → http://localhost:3100 (저장소를 보는 내부 도구)
```

`pnpm dev`는 **web · api · devhub를 함께** 띄움. mobile은 제외 — Metro는 QR · 키 입력을 쓰는 대화형 프로세스라 자기 터미널에서 `pnpm dev:mobile`로 띄움

```bash
pnpm dev
```

QR이 안 보일 때 확인할 것

- **`continuous: false`** — `apps/mobile/package.json`의 `nx.targets.start.continuous: false`가 없으면 Nx가 PTY를 주지 않아 Expo가 비대화형으로 뜸
- **`CI` 환경변수** — 설정돼 있으면 Expo가 비대화형으로 뜸

DevHub 로컬 env — "에디터에서 열기"(개발 서버 전용) · `/evals` 모델 목록

```bash
cp apps/devhub/.env.example apps/devhub/.env.local
```

- **`DEVHUB_EDITOR`** — 열 에디터. 기본 VS Code. `antigravity` · `cursor` · `vscode` · `windsurf` · `zed` · `idea` · `webstorm`, 또는 `{path}`가 들어간 URL 형식
- **`ANTHROPIC_API_KEY` · `OPENAI_API_KEY`** — `/evals` 명령 만들기가 공급자 모델 목록을 불러옴. 비우면 모델을 직접 입력
- **모델 · 지시문 실험** — `tools/evals/lab` notebook(`pnpm eval:lab`)

동작 확인

```bash
curl -i http://127.0.0.1:8080/health
# HTTP/1.1 200 OK
# Content-Type: application/json
# {"status":"ok"}
```

### 앱 안 WebView 화면 보기

mobile 홈의 "설정 변경"은 web `/settings/processing`, 최근 처리 항목은 `/history/{jobId}`를 WebView로 엶. 홈과 사진 추가 → 확인 → 처리 → 결과는 네이티브라 Go API만 부름. **WebView 화면에는 web dev 서버 필요**

홈은 로그인 · 온보딩을 마친 사용자에게만 열림. 첫 결과 화면의 "완료"가 온보딩을 마치고 홈으로 이동. 온보딩 없이 홈만 보려면 그 사용자의 `profiles.onboarding_step`을 `complete`로 직접 변경

1. `apps/mobile/.env`에 `EXPO_PUBLIC_WEB_BASE_URL` 설정 (`.env.example` 참고). iOS 시뮬레이터 `http://localhost:3000` · Android 에뮬레이터 `http://10.0.2.2:3000` · 실기기는 개발 PC LAN IP
2. 터미널 A: `pnpm dev:web` — 실기기라면 LAN에서 받도록 `pnpm exec nx dev web --hostname 0.0.0.0`
3. 터미널 B: `pnpm dev:mobile` → `i`(iOS) · `a`(Android). `.env`를 바꿨으면 `pnpm exec nx start mobile --clear`
4. 홈 헤더의 "내 정보" → "설정 변경": 네이티브 헤더 제목이 "사진 종류별 기본 처리"이고 web의 header · sidebar가 안 보이면 정상. 저장 뒤 뒤로 가면 내 정보의 기본 처리 설정에 바뀐 값 표시

브라우저에서 앱 모드 흉내 — User-Agent 끝에 `SnapdoneApp/1` 추가 (Chrome 개발자도구 → Network conditions)

### 온보딩 처음부터 보기

온보딩 진행은 서버 `profiles.onboarding_step`에 저장되어 앱 · web이 이어 씀. 처음부터 보려면 진행을 되돌리거나 로컬 DB 사용자를 삭제

```bash
docker compose -f apps/api/compose.yaml exec postgres psql -U snapdone -d snapdone -c "UPDATE profiles SET onboarding_step = 'intro';"
```

```bash
docker compose -f apps/api/compose.yaml exec postgres psql -U snapdone -d snapdone -c 'DELETE FROM users;'
```

- **사용자 삭제** — 세션 · 프로필 · 처리 작업이 `ON DELETE CASCADE`로 함께 삭제. 앱을 다시 열면 저장된 로그인이 거부되어 로그인 화면 표시
- **사진 처리까지 보기** — `pnpm dev:api`를 띄우는 셸에 `PROCESSING_*` export(Claude · GPT · 로컬 Ollama 예시는 api `.env.example`). 새 마이그레이션이 있으면 `nx run api:migrate` 먼저

## 검사

전체 목록 · 실제로 도는 target · `verify` 구성은 [quality-gates.md](../engineering/quality-gates.md)

```bash
pnpm verify      # format:check -> lint -> typecheck -> test -> test:hooks -> build 를 순서대로
pnpm e2e         # Playwright (web-e2e, devhub-e2e) — verify에 포함되지 않음
pnpm devhub:check # DevHub catalog이 지금 저장소와 맞는지 (pnpm test에도 포함)
pnpm format      # prettier 적용 (TS/JS/JSON/MD)
pnpm health      # 개발자용 API 연결 확인 (제품 화면 아님)
```

- **어떤 target이 있는지** — 문서가 아니라 `nx show project <name>`이 기준. `nx run-many`는 target이 없는 프로젝트를 조용히 건너뜀
- **watch** — `pnpm test`는 한 번만 돎. watch는 앱 디렉터리에서 직접 실행

```bash
cd apps/web && pnpm exec vitest
```

`pnpm e2e`는 브라우저 바이너리가 필요함. 처음 한 번 설치

```bash
pnpm exec playwright install chromium firefox webkit
```

- **dev 서버 끄기** — Playwright가 가짜 인증 API(`127.0.0.1:4010`)와 `next dev`(:3000)를 직접 띄우므로 실행 전에 `pnpm dev:web` 종료
- **`e2e-ci--*` target** — 포트 충돌. `pnpm e2e`(또는 `playwright test <spec>`) 사용

`pnpm health`는 `/health`의 200과 `{"status":"ok"}`를 확인함

```bash
pnpm health                                # http://localhost:8080
pnpm health http://192.168.0.10:8080       # 실기기에서 쓸 주소 확인
API_BASE_URL=http://localhost:9000 pnpm health
```

### `pnpm build`에 mobile이 없는 이유

`mobile`의 `build` target은 **EAS 클라우드 빌드**임. 로컬 번들은 export로 생성

```bash
pnpm exec nx export mobile   # apps/mobile/dist 에 JS 번들 생성
```

## Project graph

```bash
pnpm exec nx graph              # 브라우저로 그래프 열기
pnpm exec nx show projects      # 현재 프로젝트 목록
pnpm exec nx show project api   # 특정 프로젝트의 실제 target 확인
```

## 환경변수

앱마다 자기 디렉터리에서 읽음. 루트 공용 `.env` 없음

| 앱     | 템플릿                     | 실제 파일             | 로딩 주체                      |
| ------ | -------------------------- | --------------------- | ------------------------------ |
| web    | `apps/web/.env.example`    | `apps/web/.env.local` | Next.js가 자동 로드            |
| mobile | `apps/mobile/.env.example` | `apps/mobile/.env`    | Expo CLI가 자동 로드           |
| api    | `apps/api/.env.example`    | 없음                  | **Go는 읽지 않음** — 아래 참조 |

```bash
cp apps/web/.env.example apps/web/.env.local
cp apps/mobile/.env.example apps/mobile/.env
```

`.env` · `.env.local` · `.env.*.local`은 git 제외, `.env.example`은 추적. **secret을 `.env.example`에 넣지 않음**

### public 접두사

- **Next** — `NEXT_PUBLIC_*`, 브라우저 번들에 인라인
- **Expo** — `EXPO_PUBLIC_*`, 앱 번들에 인라인
- **공개값** — 접두사가 붙은 값은 공개됨. 모바일 앱은 서버가 없어 앱이 아는 값 전부 공개값

| 앱     | 변수                                                | 용도                                                                                           |
| ------ | --------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| web    | `API_BASE_URL`                                      | 서버에서만 호출해 접두사 없음                                                                  |
| web    | `WEB_ORIGIN`                                        | 로그인 · 로그아웃 Origin 검사, callback redirect 기준                                          |
| web    | `TERMS_URL` · `PRIVACY_URL`                         | 약관 문서. production에서 없으면 로그인 비활성                                                 |
| mobile | `EXPO_PUBLIC_API_BASE_URL`                          | 기기에서 직접 호출하는 API 주소                                                                |
| mobile | `EXPO_PUBLIC_WEB_BASE_URL`                          | WebView가 여는 web 주소. 기기별 값 다름                                                        |
| mobile | `EXPO_PUBLIC_TERMS_URL` · `EXPO_PUBLIC_PRIVACY_URL` | 약관 문서. production 빌드에서 없으면 로그인 비활성                                            |
| mobile | `EXPO_PUBLIC_AUTH_REDIRECT_URI`                     | 로그인 뒤 앱 복귀 주소. Go `AUTH_MOBILE_REDIRECT_URI`와 일치 필요, 비우면 Google 로그인 비활성 |

자세한 배경은 [data-access.md](../architecture/data-access.md).

### Go API는 `.env`를 읽지 않는다

프로세스 환경변수만 읽음. 기본값 `API_HOST=127.0.0.1` · `API_PORT=8080` · `API_ENV=development`

```bash
API_PORT=9000 pnpm dev:api
```

**단, Nx가 대신 읽음.** `pnpm dev:api` · `nx test api`처럼 Nx로 돌리면 `apps/api/.env`(있다면)가 프로세스 환경에 들어감

- **증상** — `internal/config` 테스트가 기본값 대신 그 값을 보고 실패
- **방법** — 값은 셸에서 export하고 `apps/api/.env`는 만들지 않음
- **이미 있을 때 비교** — `NX_LOAD_DOT_ENV_FILES=false pnpm exec nx test api`

### 로컬 Postgres

`DATABASE_URL`은 기본값 없음. 로컬은 Docker로 띄움

```bash
docker compose -f apps/api/compose.yaml up -d
export DATABASE_URL='postgres://snapdone:snapdone@127.0.0.1:5432/snapdone?sslmode=disable'
pnpm migrate
pnpm dev:api
```

- **마이그레이션 먼저** — 서버는 마이그레이션을 적용하지 않음. `apps/api/internal/database/migrations`에 미적용 SQL이 있으면 `"err":"database: pending migrations"` 로그를 남기고 기동 거부. `nx run api:migrate`(= `pnpm migrate`, Nx 내장 `nx migrate`와 다름) 실행
- **데이터 초기화** — `docker compose -f apps/api/compose.yaml down -v`
- **`AUTH_*`** — 모두 비우면 인증 비활성, `/v1/auth/*`는 503. 일부만 설정하면 서버 기동 실패. 변수 이름은 `apps/api`의 예시 env 파일

### API 문서 (Swagger)

`API_ENV`가 `production`이 아니면 `http://127.0.0.1:8080/swagger/index.html`에서 Swagger UI 제공(원문 `/swagger/doc.json`). swag 주석을 바꿨으면 재생성해 함께 커밋

```bash
pnpm swagger        # apps/api/docs/swagger 재생성 (go tool swag, go.mod에 고정)
pnpm swagger:check  # 최신인지 검사만 한다
```

## 실기기에서 API 주소 잡기

**실제 폰에서 `localhost`는 개발 PC가 아니라 폰 자신**이라 API 호출이 전부 실패함. 주소는 코드에 넣지 않고 `EXPO_PUBLIC_API_BASE_URL`만 변경

1. 개발 PC의 LAN 주소 확인

   ```bash
   ipconfig getifaddr en0
   ```

2. `apps/mobile/.env` 수정

   ```
   EXPO_PUBLIC_API_BASE_URL=http://192.168.0.10:8080
   ```

3. Go 서버를 LAN에 노출 (기본값 `127.0.0.1`은 외부에서 접근 불가)

   ```bash
   API_HOST=0.0.0.0 pnpm dev:api
   ```

4. Metro 재시작 — `EXPO_PUBLIC_*`는 번들에 인라인되어 서버 재시작만으로는 미반영

   ```bash
   pnpm exec nx start mobile --clear
   ```

- **같은 Wi-Fi** — 폰과 PC가 같은 네트워크여야 함. 회사 · 카페 네트워크는 기기 간 통신을 막는 경우가 많음
- **Android 에뮬레이터** — `10.0.2.2`가 호스트. 소스에 넣지 않고 `.env`에서 지정

## 자주 겪는 환경 차이

**pnpm store 불일치** — 다른 셸 · 환경에서 설치해 `node_modules`의 store와 pnpm이 쓰려는 store가 다를 때

```
ERR_PNPM_UNEXPECTED_STORE  Unexpected store location
```

```bash
rm -rf node_modules .pnpm-store
pnpm install
```

**포트 충돌** — web 3000 · Go API 8080 · Metro 8081 · DevHub 3100

```bash
lsof -nP -iTCP:8080 -sTCP:LISTEN
API_PORT=9000 pnpm dev:api
```

**Xcode가 Command Line Tools만 설치된 경우** — `nx run-ios mobile`은 full Xcode(26.4+) 필요. 없으면 Expo Go로 실기기 확인

```
xcode-select: error: tool 'xcodebuild' requires Xcode
```

**Android 도구 없음** — `java` · `adb` · `ANDROID_HOME`이 없으면 `nx run-android mobile` 실행 불가. Expo Go로 대신

**Nx 캐시 때문에 결과가 이상할 때**

```bash
pnpm exec nx reset
pnpm lint --skip-nx-cache
```

**Expo SDK 버전 고정** — SDK 56 고정(`@nx/expo`가 57 미지원). mobile 패키지 버전은 SDK 지정값 사용

```bash
node -e "console.log(require('expo/bundledNativeModules.json')['패키지명'])"
```

- **버전 기재 위치** — **루트 `package.json`에 실제 버전, `apps/mobile/package.json`에는 `"*"`**. 루트에 빠뜨리면 `"*"`가 레지스트리 최신으로 해석되어 SDK와 어긋남
- **사본 고정** — `react` · `react-dom` · `react-native` · `react-native-svg` · `@berrypjh/react-native-ui`는 `pnpm-workspace.yaml`의 `overrides`로 고정. 없으면 `"*"`가 lock의 옛 해석을 유지해 두 벌씩 설치되고 Expo Go가 아래처럼 멈춤

```
Render Error — Cannot read property 'default' of undefined
  require('./Renderer/shims/ReactNative').default   (RendererImplementation.js)
```

이 오류가 보이면 캐시를 지우기 전에 사본 수부터 확인

```bash
pnpm why react --filter @snapdone/mobile
find node_modules/.pnpm -maxdepth 1 -name 'react-native@*'   # 한 줄이어야 한다
```

버전을 맞춘 뒤 `pnpm install` → `pnpm exec nx start mobile --clear`로 Metro 캐시까지 재생성
