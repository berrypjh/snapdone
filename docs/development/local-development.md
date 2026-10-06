# Local Development

이 문서의 명령은 전부 실제 `package.json` script와 Nx target에 대응한다. 동작하지 않는 명령은 적지 않는다.

## Requirements

| 도구 | 버전    | 확인                                     |
| ---- | ------- | ---------------------------------------- |
| Node | 24.14.0 | `.nvmrc`로 고정. `nvm use`               |
| pnpm | 10.30.3 | `package.json`의 `packageManager`로 고정 |
| Go   | 1.26.6  | `go version`                             |

모바일을 **기기/시뮬레이터에서 직접 실행**할 때만 추가로 필요하다.

| 대상               | 필요한 것                                                  |
| ------------------ | ---------------------------------------------------------- |
| iOS 시뮬레이터     | full Xcode **26.4 이상** (Command Line Tools만으로는 불가) |
| Android 에뮬레이터 | JDK, Android SDK, `ANDROID_HOME`                           |

Expo Go 앱으로 실기기에서 볼 때는 둘 다 필요 없다.

## Install

lint · format · tsconfig · commitlint 설정은 `@berrypjh/*` 공유 패키지에서 온다. 이 패키지들은 **GitHub Packages**에 있어서 설치 전에 토큰이 필요하다.

```bash
export GITHUB_TOKEN=<read:packages 권한이 있는 PAT>
```

`.npmrc`가 `@berrypjh` 스코프를 `npm.pkg.github.com`으로 보내고 이 변수를 읽는다. 토큰이 없으면 `pnpm install`이 401로 실패한다.

```bash
nvm use
pnpm install
```

`pnpm install`은 Node·pnpm 버전이 고정값과 다르면 경고한다. `prepare` 스크립트가 husky를 설치해 `.husky/`의 훅이 활성화된다. Go 모듈은 `go.mod`에 고정돼 있고 첫 `go` 명령이 받는다.

## 실행

각 앱은 별도 터미널에서 띄운다.

```bash
pnpm dev:web      # Next.js  → http://localhost:3000
pnpm dev:api      # Go API   → http://127.0.0.1:8080
pnpm dev:mobile   # Expo (Metro 개발 서버)
pnpm dev:devhub    # DevHub → http://localhost:3100 (저장소를 보는 내부 도구)
```

**DevHub의 "에디터에서 열기"는 개발 서버에서만 보인다**(이 컴퓨터의 절대 경로를 쓴다). 기본 에디터는 VS Code이고, 다른 에디터는 `DEVHUB_EDITOR`로 고른다 — `antigravity` · `cursor` · `vscode` · `windsurf` · `zed` · `idea` · `webstorm`, 또는 `{path}`가 들어간 URL 형식. 로컬 env 파일에 둔다.

```bash
cp apps/devhub/.env.example apps/devhub/.env.local
```

같은 파일에 `ANTHROPIC_API_KEY` · `OPENAI_API_KEY`를 넣으면 `/evals`의 명령 만들기가 공급자의 모델 목록을 불러온다. 비워 두면 모델은 직접 적는다. 모델 · 지시문 실험은 `tools/evals/lab`의 notebook에서 한다(`pnpm eval:lab`).

`pnpm dev` 하나로 **web · api · devhub를 함께** 띄울 수도 있다. devhub는 3100에 고정돼 web(3000)과 부딪히지 않는다.

```bash
pnpm dev
```

**mobile은 여기에 포함되지 않는다.** Metro는 QR과 키 입력을 쓰는 대화형 프로세스라 자기 터미널에서 `pnpm dev:mobile`로 띄운다.

QR이 안 보이면 두 가지를 본다.

- `apps/mobile/package.json`의 `nx.targets.start.continuous: false`가 있는지 — 없으면 Nx가 PTY를 주지 않아 Expo가 비대화형으로 뜬다
- `CI` 환경변수가 설정돼 있는지 — Expo는 `CI`가 있으면 비대화형으로 뜬다

동작 확인:

```bash
curl -i http://127.0.0.1:8080/health
# HTTP/1.1 200 OK
# Content-Type: application/json
# {"status":"ok"}
```

### 앱 안 WebView 화면 보기

mobile 홈의 "기록 보기" · "기본 처리 설정"은 web의 `/history` · `/settings/processing`을 WebView로 연다. **web dev 서버가 떠 있어야 한다.**

홈은 로그인했고 온보딩을 마친 사용자에게만 열린다. 앱과 web 모두 첫 결과 화면에서 "완료"를 누르면 온보딩을 마치고 홈으로 간다. 온보딩을 거치지 않고 홈만 보려면 그 사용자의 `profiles.onboarding_step`을 직접 `complete`로 바꾼다.

1. `apps/mobile/.env`에 `EXPO_PUBLIC_WEB_BASE_URL`을 넣는다 (`.env.example` 참고). iOS 시뮬레이터 `http://localhost:3000` · Android 에뮬레이터 `http://10.0.2.2:3000` · 실기기는 개발 PC LAN IP
2. 터미널 A: `pnpm dev:web` — 실기기라면 LAN에서 받도록 `pnpm exec nx dev web --hostname 0.0.0.0`
3. 터미널 B: `pnpm dev:mobile` → `i`(iOS) · `a`(Android). `.env`를 바꿨으면 `pnpm exec nx start mobile --clear`
4. 홈 → "기록 보기": 네이티브 헤더 제목이 "기록"이고 web의 header · sidebar가 보이지 않아야 한다

브라우저에서 앱 모드를 흉내 내려면 User-Agent 끝에 `SnapdoneApp/1`을 붙인다 (Chrome 개발자도구 → Network conditions).

### 온보딩 처음부터 보기

온보딩 진행(단계 · 목적)은 **서버의 `profiles`에** 저장된다(`onboarding_step` · `onboarding_purposes`). 그래서 앱에서 하던 진행을 web에서, web에서 하던 진행을 앱에서 이어 간다. 처음부터 보려면 그 사용자의 진행을 되돌리거나 로컬 DB의 사용자를 지운다. 사용자를 지우면 세션 · 프로필 · 처리 작업이 `ON DELETE CASCADE`로 함께 지워져 다음 로그인이 새 사용자가 된다.

```bash
docker compose -f apps/api/compose.yaml exec postgres psql -U snapdone -d snapdone -c "UPDATE profiles SET onboarding_step = 'intro', onboarding_purposes = NULL;"
```

```bash
docker compose -f apps/api/compose.yaml exec postgres psql -U snapdone -d snapdone -c 'DELETE FROM users;'
```

사용자를 지운 뒤 앱을 다시 열면 저장된 로그인이 거부되어 로그인 화면이 나온다. 사진 처리까지 보려면 `pnpm dev:api`를 띄우는 셸에 `PROCESSING_*`(Claude · GPT · 로컬 Ollama 예시는 api의 `.env.example`)를 export하고, 새 마이그레이션이 있으면 `nx run api:migrate`를 먼저 실행한다.

## 검사

```bash
pnpm verify      # format:check -> lint -> typecheck -> test -> test:hooks -> build 를 순서대로
pnpm lint        # eslint(web, mobile, web-e2e, devhub, devhub-e2e, libs, tools/scripts, .claude/hooks) + go vet + gofmt 검사
pnpm typecheck   # tsc (web, mobile, web-e2e, devhub, devhub-e2e, libs)
pnpm test        # go test(api) + Vitest(web, mobile, devhub, libs) — 한 번 돌고 끝남
pnpm test:hooks  # .claude/hooks/ · tools/scripts 회귀 테스트 (Nx 프로젝트가 아니라 별도)
pnpm e2e         # Playwright (web-e2e, devhub-e2e) — verify에 포함되지 않음
pnpm build       # next build(web, devhub) + go build
pnpm devhub:check # DevHub catalog이 지금 저장소와 맞는지 (pnpm test에도 포함)
pnpm format      # prettier 적용 (TS/JS/JSON/MD)
pnpm format:check
pnpm health      # 개발자용 API 연결 확인 (제품 화면 아님)
```

단위 테스트를 watch로 돌리려면 앱 디렉터리에서 직접 띄운다. `pnpm test`는 CI/게이트용이라 한 번만 돈다.

```bash
cd apps/web && pnpm exec vitest
```

`pnpm e2e`는 브라우저 바이너리와 dev 서버가 필요하다. 처음 한 번은 브라우저를 받아야 한다.

```bash
pnpm exec playwright install chromium firefox webkit
```

Playwright가 가짜 인증 API(`127.0.0.1:4010`)와 `next dev`(:3000)를 직접 띄우므로 **실행 전에 `pnpm dev:web`을 끈다.** `e2e-ci--*` target은 포트가 충돌하므로 `pnpm e2e`(또는 `playwright test <spec>`)로 돌린다.

`pnpm health`는 설정된 주소로 `/health`를 호출해서 200과 `{"status":"ok"}`를 확인한다. 주소를 바꿔서 확인할 수도 있다.

```bash
pnpm health                                # http://localhost:8080
pnpm health http://192.168.0.10:8080       # 실기기에서 쓸 주소 확인
API_BASE_URL=http://localhost:9000 pnpm health
```

각 명령이 실제로 무엇을 도는지:

| script           | 실행되는 것                                                                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint`      | `nx run-many -t lint,vet,fmt` — `lint`가 있는 프로젝트와 api의 `vet` · `fmt`, 이어서 루트 `eslint`가 `eslint.config.mjs` · `tools/scripts` · `.claude/hooks`를 본다 |
| `pnpm typecheck` | `nx run-many -t typecheck`                                                                                                                                          |
| `pnpm test`      | `nx run-many -t test`                                                                                                                                               |
| `pnpm build`     | `nx run-many -t build --exclude=mobile`                                                                                                                             |

`nx run-many`는 해당 target이 없는 프로젝트를 조용히 건너뛴다. **어느 프로젝트에 어떤 target이 있는지는 이 표가 아니라 `nx show project <name>`이 기준이다.**

### `pnpm build`에 mobile이 없는 이유

`mobile`의 `build` target은 **EAS 클라우드 빌드**다. 모바일 번들을 로컬에서 만들려면:

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

앱마다 자기 디렉터리에서 읽는다. 루트에 공용 `.env`는 두지 않는다.

| 앱     | 템플릿                     | 실제 파일             | 로딩 주체                      |
| ------ | -------------------------- | --------------------- | ------------------------------ |
| web    | `apps/web/.env.example`    | `apps/web/.env.local` | Next.js가 자동 로드            |
| mobile | `apps/mobile/.env.example` | `apps/mobile/.env`    | Expo CLI가 자동 로드           |
| api    | `apps/api/.env.example`    | 없음                  | **Go는 읽지 않음** — 아래 참조 |

```bash
cp apps/web/.env.example apps/web/.env.local
cp apps/mobile/.env.example apps/mobile/.env
```

`.env`, `.env.local`, `.env.*.local`은 git에서 제외된다. `.env.example`은 추적된다. **secret을 `.env.example`에 넣지 않는다.**

### public 접두사

- Next: `NEXT_PUBLIC_*` — 브라우저 번들에 인라인된다
- Expo: `EXPO_PUBLIC_*` — 앱 번들에 인라인된다

**접두사가 붙은 값은 공개된 값이다.** 접두사만 떼면 감춰지는 게 아니라, 서버에서만 읽히는 값이 된다. 모바일 앱에는 서버가 없으므로 앱이 아는 값은 전부 공개값이다.

지금 API 주소는 앱마다 이름이 다르다.

| 앱     | 변수                                                | 이유                                                                                             |
| ------ | --------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| web    | `API_BASE_URL`                                      | 서버에서만 호출한다. 브라우저 번들에 들어갈 이유가 없다                                          |
| web    | `WEB_ORIGIN`                                        | 이 web의 origin. 로그인 · 로그아웃 Origin 검사, callback redirect 기준                           |
| web    | `TERMS_URL` · `PRIVACY_URL`                         | 약관 문서. production에서 없으면 로그인 비활성                                                   |
| mobile | `EXPO_PUBLIC_API_BASE_URL`                          | 앱에 서버가 없어 기기에서 직접 호출한다                                                          |
| mobile | `EXPO_PUBLIC_WEB_BASE_URL`                          | WebView가 여는 web 주소. API와 같은 이유로 기기별 값이 다르다                                    |
| mobile | `EXPO_PUBLIC_TERMS_URL` · `EXPO_PUBLIC_PRIVACY_URL` | 약관 문서. production 빌드에서 없으면 로그인 비활성                                              |
| mobile | `EXPO_PUBLIC_AUTH_REDIRECT_URI`                     | 로그인 뒤 앱 복귀 주소. Go `AUTH_MOBILE_REDIRECT_URI`와 같아야 하고, 비우면 Google 로그인 비활성 |

자세한 배경은 [data-access.md](../architecture/data-access.md).

### Go API는 `.env`를 읽지 않는다

`.env` 파서 의존성을 넣지 않았다. 프로세스 환경변수만 본다.

```bash
API_PORT=9000 pnpm dev:api
```

기본값은 `API_HOST=127.0.0.1`, `API_PORT=8080`, `API_ENV=development`다.

**단, Nx가 대신 읽는다.** `pnpm dev:api` · `nx test api`처럼 Nx로 돌리면 Nx가 `apps/api/.env`(있다면)를 프로세스 환경에 넣는다. 그 파일이 있으면 `internal/config` 테스트가 기본값 대신 그 값을 보고 실패한다. 값은 셸에서 export하고 `apps/api/.env`는 만들지 않는다. 이미 있다면 `NX_LOAD_DOT_ENV_FILES=false pnpm exec nx test api`로 비교한다.

### 로컬 Postgres

`DATABASE_URL`은 기본값이 없다. 로컬은 Docker로 띄운다.

```bash
docker compose -f apps/api/compose.yaml up -d
export DATABASE_URL='postgres://snapdone:snapdone@127.0.0.1:5432/snapdone?sslmode=disable'
pnpm migrate
pnpm dev:api
```

서버는 마이그레이션을 적용하지 않는다. `apps/api/internal/database/migrations`에 미적용 SQL이 있으면 `"msg":"api refused to start; …","err":"database: pending migrations"` 로그(`log/slog` JSON, stderr)를 남기고 기동을 거부하므로 `nx run api:migrate`를 먼저 실행한다(Nx 내장 `nx migrate`와 다른 명령이다). 데이터를 지우려면 `docker compose -f apps/api/compose.yaml down -v`.

`AUTH_*`를 비워 두면 인증이 비활성이고 `/v1/auth/*`는 503을 돌려준다. 일부만 설정하면 서버가 기동하지 않는다. 변수 이름은 `apps/api`의 예시 env 파일에 있다.

### API 문서 (Swagger)

`API_ENV`가 `production`이 아니면 `http://127.0.0.1:8080/swagger/index.html`에서 Swagger UI를 볼 수 있다(스펙 원문은 `/swagger/doc.json`). 핸들러의 swag 주석을 바꿨으면 다시 생성해 함께 커밋한다.

```bash
pnpm swagger        # apps/api/docs/swagger 재생성 (go tool swag, go.mod에 고정)
pnpm swagger:check  # 최신인지 검사만 한다
```

## 실기기에서 API 주소 잡기

**시뮬레이터/에뮬레이터가 아닌 실제 폰에서는 `localhost`가 개발 PC가 아니라 폰 자신을 가리킨다.** 이 상태로는 API 호출이 전부 실패한다.

주소는 코드에 박지 않는다. `EXPO_PUBLIC_API_BASE_URL` 하나만 바꾸면 된다.

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

4. Metro 재시작 — `EXPO_PUBLIC_*`는 번들에 인라인되므로 서버만 다시 띄워서는 반영되지 않는다

   ```bash
   pnpm exec nx start mobile --clear
   ```

폰과 PC가 **같은 Wi-Fi**에 있어야 한다. 회사·카페 네트워크는 기기 간 통신을 막는 경우가 많다.

Android 에뮬레이터는 `10.0.2.2`가 호스트를 가리키지만, **이 값을 소스에 넣지 않는다.** 필요하면 `.env`에서 지정한다.

## 자주 겪는 환경 차이

**pnpm store 불일치**

```
ERR_PNPM_UNEXPECTED_STORE  Unexpected store location
```

`node_modules`가 링크된 store와 pnpm이 쓰려는 store가 다를 때 난다. 다른 셸/환경에서 설치했을 때 발생한다.

```bash
rm -rf node_modules .pnpm-store
pnpm install
```

**포트 충돌**

web(Next)은 3000, Go API는 8080, Metro는 8081, DevHub는 3100을 쓴다. 점유 중이면:

```bash
lsof -nP -iTCP:8080 -sTCP:LISTEN
API_PORT=9000 pnpm dev:api
```

**Xcode가 Command Line Tools만 설치된 경우**

```
xcode-select: error: tool 'xcodebuild' requires Xcode
```

`nx run-ios mobile`은 full Xcode(26.4+)가 필요하다. 없으면 Expo Go로 실기기 확인을 대신한다.

**Android 도구 없음**

`java`, `adb`, `ANDROID_HOME`이 없으면 `nx run-android mobile`은 실행되지 않는다. Expo Go로 대신한다.

**Nx 캐시 때문에 결과가 이상할 때**

```bash
pnpm exec nx reset
pnpm lint --skip-nx-cache
```

**Expo SDK 버전 고정**

Expo **SDK 56**에 고정되어 있다(`@nx/expo`가 57 미지원). mobile 패키지 버전은 SDK가 지정한 값을 쓴다.

```bash
node -e "console.log(require('expo/bundledNativeModules.json')['패키지명'])"
```

그리고 **루트 `package.json`에 실제 버전을, `apps/mobile/package.json`에는 `"*"`를** 적는다. 루트에 빠뜨리면 `"*"`가 레지스트리 최신 버전으로 해석되어 SDK와 어긋난 패키지가 들어온다.

**사본이 갈리면 안 되는 패키지는 `pnpm-workspace.yaml`의 `overrides`로 못박는다** (`react` · `react-dom` · `react-native` · `react-native-svg` · `@berrypjh/react-native-ui`). `"*"`는 lock의 옛 해석을 유지해서, overrides가 없으면 React와 react-native가 두 벌씩 설치되고 Expo Go가 이렇게 멈춘다.

```
Render Error — Cannot read property 'default' of undefined
  require('./Renderer/shims/ReactNative').default   (RendererImplementation.js)
```

이 오류가 보이면 캐시를 지우기 전에 사본 수부터 확인한다.

```bash
pnpm why react --filter @snapdone/mobile
find node_modules/.pnpm -maxdepth 1 -name 'react-native@*'   # 한 줄이어야 한다
```

버전을 맞춘 뒤 `pnpm install` → `pnpm exec nx start mobile --clear`로 Metro 캐시까지 새로 만든다.
