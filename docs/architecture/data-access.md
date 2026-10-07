# Data Access

앱이 API와 이야기하는 방식의 규칙이다. endpoint가 아직 적어 **구현보다 규칙이 앞서 있는 상태**다.

## 지금 있는 것

| 위치                                             | 역할                                                                                                      |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `apps/web/src/lib/api.ts`                        | web이 base URL을 읽는 유일한 지점, `/health` 호출                                                         |
| `apps/web/src/lib/auth/api.ts`                   | web 인증 호출 (Server Action · Route Handler · 세션 확인)                                                 |
| `apps/mobile/src/lib/api.ts`                     | mobile이 base URL을 읽는 유일한 지점, `/health` 호출                                                      |
| `apps/mobile/src/auth/api.ts`                    | mobile 인증 호출                                                                                          |
| `apps/web/src/lib/onboarding/api.ts`             | web 온보딩 진행 · 사진 처리 호출. Server Action(`actions.ts`)이 서버에서 부른다                           |
| `apps/web/src/lib/processing-preferences/api.ts` | web 처리 방식 조회 · 유형 하나 변경. Server Action(`actions.ts`)이 서버에서 부른다                        |
| `apps/web/src/lib/processing-jobs/api.ts`        | web 최근 처리 기록 조회. 홈(`lib/home/home.ts`)이 처리 방식과 함께 서버에서 부른다                        |
| `apps/mobile/src/onboarding/progressApi.ts`      | mobile 온보딩 진행 호출                                                                                   |
| `apps/mobile/src/onboarding/processingApi.ts`    | mobile 사진 처리 호출 (multipart 업로드 · 작업 조회). credential은 `AuthController.authorized`로만 받는다 |
| `apps/mobile/src/home/homeApi.ts`                | mobile 홈의 최근 처리 기록 · 처리 방식 조회. credential은 `AuthController.authorized`로만 받는다          |
| `tools/scripts/check-api-health.mjs`             | 개발자용 연결 확인 명령 (`pnpm health`)                                                                   |

HTTP 클라이언트 라이브러리는 없다. Node와 React Native 모두 `fetch`를 기본 제공한다.

`pnpm health`는 URL을 자기가 조립하지 않고 **web 앱의 `fetchHealth`를 그대로 호출한다.** 스크립트가 통과했다는 것은 앱이 쓰는 코드 경로가 통과했다는 뜻이다. 검증용 사본을 따로 두면 진짜 코드가 깨져도 스크립트는 초록불이 된다.

제품 화면에는 health 상태를 노출하지 않는다. API 상태는 사용자가 알아야 할 정보가 아니다.

## 규칙

**URL 문자열을 화면 코드에 쓰지 않는다.** component는 `lib/api`가 노출하는 함수만 부른다. base URL을 아는 파일은 앱당 하나뿐이다.

**환경변수가 없으면 조용히 넘어가지 않는다.** base URL이 비어 있으면 두 앱 모두 무엇을 복사해야 하는지 알려주는 오류를 던진다. `localhost` fallback을 코드에 박으면 잘못된 설정이 배포될 때까지 드러나지 않는다.

**`any`를 쓰지 않는다.** 응답은 좁은 타입 가드로 확인한다. 인증 응답 타입과 가드는 web · mobile이 함께 쓰므로 `libs/auth-contracts`에 둔다. 코드 생성기는 만들지 않는다.

## Web은 서버에서 호출한다

`apps/web`은 **서버에서** Go API를 호출한다 — 읽기는 Server Component, 로그인 시작 · 로그아웃은 Server Action, OAuth 복귀는 `/auth/callback` Route Handler. 브라우저는 Go API를 직접 부르지 않는다.

그래서:

- base URL은 `API_BASE_URL`이다. **`NEXT_PUBLIC_` 접두사가 없다.** 브라우저 번들에 들어갈 이유가 없다
- **CORS 설정이 필요 없다.** 서버 대 서버 요청에는 origin 검사가 없다
- 프록시 route(`app/api/*`)도 만들지 않았다. Server Component가 직접 부르면 되는 일에 중간 계층을 두지 않는다

### 언제 이 결정을 다시 볼 것인가

브라우저가 Go API를 **직접** 불러야 하는 상황이 생기면 바뀐다. 가장 유력한 계기는 **이미지 업로드**다. 큰 파일을 Next 서버를 거쳐 보내면 같은 바이트를 두 번 전송하게 된다.

그때 함께 해야 하는 일:

1. `NEXT_PUBLIC_API_BASE_URL` 추가 (브라우저가 알아야 하므로)
2. Go에 허용 origin 설정 — `API_ALLOWED_ORIGIN`을 읽어서 처리
3. development와 production origin을 나눠서 관리
4. credential 정책을 명시 (쿠키를 보낼 것인가)
5. **production에서 `*`를 쓰지 않는다**

**사진은 이 전환 없이 Server Action으로 올린다** — 온보딩 첫 사진, 사진 처리 화면(`/process`), 같은 사진의 다시 처리 모두다. 사진 한 장(최대 7,500,000 byte)을 한 번 받는 흐름이라 두 번 전송하는 비용보다 CORS · 브라우저 credential 정책을 새로 여는 비용이 크다. Server Action 본문 상한은 `next.config.js`의 `experimental.serverActions.bodySizeLimit`(`8mb`)이고, 브라우저는 상한을 넘는 파일을 보내기 전에 거절한다. 여러 장 · 반복 업로드가 생기면 위 절차로 다시 본다.

**지금 미리 만들지 않는다.** 쓰이지 않는 CORS middleware는 잘못된 설정을 숨긴 채 통과시키는 통로가 되기 쉽다.

## Mobile은 항상 직접 호출한다

`apps/mobile`에는 서버가 없다. 앱이 Go API를 직접 부른다.

- base URL은 `EXPO_PUBLIC_API_BASE_URL`이다. **앱 번들에 인라인되므로 공개값이다.** secret을 두지 않는다
- `process.env.EXPO_PUBLIC_API_BASE_URL`은 **직접 프로퍼티 접근으로만** 쓴다. Expo가 빌드 시 이 표현식을 그대로 치환하므로 `process.env[key]` 같은 동적 접근은 실제 빌드에서 `undefined`가 된다
- 브라우저가 아니므로 CORS와 무관하다
- `localhost`, `10.0.2.2`, 사설 IP를 **코드에 넣지 않는다.** 기기별 차이는 `.env`로 해결한다 ([local-development.md](../development/local-development.md) 참조)

## 앱 WebView에서 열린 web

구조는 [target-architecture.md](./target-architecture.md#제품-구성--네이티브-셸--웹-콘텐츠).

web 화면이 앱 WebView 안에서 열려도 **데이터 경로는 바뀌지 않는다.** WebView는 브라우저이고, web은 여전히 서버에서 Go API를 부른다. CORS · `NEXT_PUBLIC_*` 판단도 위 "Web은 서버에서 호출한다"와 같다.

### WebView 로그인 핸드오프

앱의 로그인 상태는 WebView에 자동으로 넘어가지 않는다. 표준 방식은 일회용 코드 교환이다.

1. WebView가 `/auth/handoff/start?next=`를 열면 web 서버가 verifier를 **HttpOnly cookie**에 두고, ready page가 challenge만 앱에 보낸다(`handoff-ready`)
2. 로그인한 앱이 자기 Bearer와 challenge로 Go API에서 30초 **일회용 코드**를 받는다
3. 앱이 WebView로 `/auth/handoff?code=…&next=<경로>`를 연다
4. web 서버가 코드와 cookie의 verifier를 Go API로 교환하고 child 세션 **httpOnly 쿠키**를 심은 뒤 `next`로 redirect한다

- access token을 URL · JS 전역 · `injectJavaScript`로 넘기지 않는다. 코드는 1회용이고 만료가 짧다
- `next`는 같은 도메인 경로만 허용한다 (open redirect 방지). 정해진 경로(`/` · `/history` · `/settings/processing`)와 정확히 같거나, 처리 결과 하나인 `/history/{jobId}`(jobId는 소문자 uuid)뿐이다. 하위 경로 · query · 대문자는 받지 않는다. 같은 규칙을 Go `auth.allowedNext`, web `safeReturnPath`, mobile `webViewNavigation`(TS 쪽은 `@snapdone/webview-bridge`의 `isJobDetailPath`)이 각자 검사한다
- 브라우저 단독 접속은 web 자체 로그인 흐름을 쓰고, 세션 쿠키 형식은 핸드오프와 같다
- verifier가 없는 브라우저로 코드를 열면 교환하지 않는다(login-CSRF 방지). 세션 토큰 · verifier는 bridge · JS로 나가지 않는다
- 구현됐다. web `src/lib/auth/handoff.ts`, Go `internal/auth/handoff.go`, E2E `auth.spec.ts`의 WebView handoff

## 앞으로: UI는 API를 직접 모른다

business API가 생기면 아래 형태를 쓴다.

```
UI (component)
  → query / service adapter
    → API 또는 mock
```

- component는 adapter 함수만 부른다. `fetch`도 URL도 모른다
- adapter는 교체 가능해야 한다. 화면을 고치지 않고 실제 API와 mock을 바꿔 끼울 수 있어야 한다
- 이 경계가 있어야 API가 준비되기 전에 화면을 만들 수 있고, 테스트에서 네트워크를 끊을 수 있다

**mock 프레임워크는 지금 설치하지 않는다.** mock으로 대체할 business API가 아직 없다. 첫 화면이 실제 데이터를 요구할 때 adapter와 함께 판단한다.

## Contract 전략

Go와 TypeScript는 언어가 달라 타입을 직접 공유할 수 없다. `/health`의 `{ status: string }`은 각 앱에 작은 타입을 손으로 두었고, 인증 wire 타입은 `libs/auth-contracts`에 손으로 두었다.

endpoint가 늘어나면 이 방식은 무너진다. 응답 타입을 손으로 베껴 쓰는 파일이 여러 개 생기는 순간이 전략을 도입할 시점이다. 그때 후보는 OpenAPI 스펙에서 TS 타입을 생성하는 방식이며, 생성물을 두는 위치는 `libs/`가 된다.

Go API의 Swagger 2.0 스펙은 이미 생성된다(`apps/api/docs/swagger/swagger.json`, 개발 환경 UI `/swagger/index.html`). route와 문서가 어긋나면 `go test`가 실패하므로 그 스펙이 wire 계약의 기준이다. **TS 클라이언트 · 타입은 아직 생성하지 않는다** — 위 시점이 오면 이 스펙을 입력으로 쓴다.

**그 전까지 각 앱이 응답 타입을 임의로 늘려 쓰지 않는다.**
