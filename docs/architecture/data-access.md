# Data Access

앱이 API와 이야기하는 방식의 규칙이다.

## 지금 있는 것

| 위치                                                 | 역할                                                                                                                       |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/lib/api.ts`                            | web이 base URL을 읽는 유일한 지점, `/health` 호출                                                                          |
| `apps/web/src/lib/<영역>/api.ts`                     | web 영역별 호출(인증 · 온보딩 · 처리 방식 · 처리 기록). Server Component · Server Action · Route Handler가 서버에서 부른다 |
| `apps/mobile/src/lib/api.ts`                         | mobile이 base URL을 읽는 유일한 지점, `/health` 호출                                                                       |
| `apps/mobile/src/<영역>/*Api.ts` · `src/auth/api.ts` | mobile 영역별 호출. credential은 호출하는 쪽이 `AuthController.authorized`로 넘긴다                                        |
| `tools/scripts/check-api-health.mjs`                 | 개발자용 연결 확인 명령 (`pnpm health`)                                                                                    |

HTTP 클라이언트 라이브러리는 없다. Node와 React Native 모두 `fetch`를 기본 제공한다.

`pnpm health`는 URL을 조립하지 않고 **web 앱의 `fetchHealth`를 그대로 호출한다.** 검증용 사본을 두면 진짜 코드가 깨져도 스크립트는 통과한다.

제품 화면에는 health 상태를 노출하지 않는다.

## 규칙

**URL 문자열을 화면 코드에 쓰지 않는다.** component는 `lib/api`가 노출하는 함수만 부른다. base URL을 아는 파일은 앱당 하나뿐이다.

**환경변수가 없으면 조용히 넘어가지 않는다.** base URL이 비어 있으면 무엇을 복사해야 하는지 알려 주는 오류를 던진다. `localhost` fallback은 잘못된 설정을 배포 때까지 숨긴다.

**`any`를 쓰지 않는다.** 응답은 좁은 타입 가드로 확인한다. 인증 응답 타입과 가드는 web · mobile이 함께 쓰므로 `libs/auth-contracts`에 둔다. 코드 생성기는 만들지 않는다.

## Web은 서버에서 호출한다

`apps/web`은 **서버에서** Go API를 호출한다 — 읽기는 Server Component, 로그인 시작 · 로그아웃은 Server Action, OAuth 복귀는 `/auth/callback` Route Handler. 브라우저는 Go API를 직접 부르지 않는다.

- base URL은 `API_BASE_URL`이다. **`NEXT_PUBLIC_` 접두사가 없다.** 브라우저 번들에 들어갈 이유가 없다
- **CORS 설정이 필요 없다.** 서버 대 서버 요청에는 origin 검사가 없다
- 프록시 route(`app/api/*`)도 만들지 않았다. Server Component가 직접 부르면 되는 일에 중간 계층을 두지 않는다

### 언제 이 결정을 다시 볼 것인가

브라우저가 Go API를 **직접** 불러야 할 때다. 유력한 계기는 큰 이미지 업로드(Next 서버를 거치면 같은 바이트를 두 번 전송)다.

그때 함께 해야 하는 일:

1. `NEXT_PUBLIC_API_BASE_URL` 추가 (브라우저가 알아야 하므로)
2. Go에 허용 origin 설정 — `API_ALLOWED_ORIGIN`을 읽어서 처리
3. development와 production origin을 나눠서 관리
4. credential 정책을 명시 (쿠키를 보낼 것인가)
5. **production에서 `*`를 쓰지 않는다**

**사진은 이 전환 없이 Server Action으로 올린다** — 온보딩 첫 사진 · `/process` · 다시 처리 모두. 한 장(최대 7,500,000 byte)을 한 번 받는 흐름이라 두 번 전송 비용보다 CORS · 브라우저 credential 정책을 여는 비용이 크다. 본문 상한은 `next.config.js`의 `experimental.serverActions.bodySizeLimit`(`8mb`)이고, 브라우저가 상한을 넘는 파일을 보내기 전에 거절한다. 여러 장 · 반복 업로드가 생기면 위 절차로 다시 본다.

**CORS를 미리 만들지 않는다.** 쓰이지 않는 middleware는 잘못된 설정을 숨긴다.

## Mobile은 항상 직접 호출한다

`apps/mobile`에는 서버가 없다. 앱이 Go API를 직접 부른다.

- base URL은 `EXPO_PUBLIC_API_BASE_URL`이다. **앱 번들에 인라인되므로 공개값이다.** secret을 두지 않는다
- `process.env.EXPO_PUBLIC_API_BASE_URL`은 **직접 프로퍼티 접근으로만** 쓴다. Expo가 빌드 시 이 표현식을 그대로 치환하므로 `process.env[key]` 같은 동적 접근은 실제 빌드에서 `undefined`가 된다
- 브라우저가 아니므로 CORS와 무관하다
- `localhost`, `10.0.2.2`, 사설 IP를 **코드에 넣지 않는다.** 기기별 차이는 `.env`로 해결한다 ([local-development.md](../development/local-development.md) 참조)

## 앱 WebView에서 열린 web

구조는 [target-architecture.md](./target-architecture.md#제품-구성--네이티브-셸--웹-콘텐츠).

web 화면이 앱 WebView 안에서 열려도 **데이터 경로는 바뀌지 않는다.** web은 여전히 서버에서 Go API를 부르고, CORS · `NEXT_PUBLIC_*` 판단도 위와 같다.

### WebView 로그인 핸드오프

앱의 로그인 상태는 WebView에 자동으로 넘어가지 않아 일회용 코드로 교환한다.

1. WebView가 `/auth/handoff/start?next=`를 열면 web 서버가 verifier를 **HttpOnly cookie**에 두고, ready page가 challenge만 앱에 보낸다(`handoff-ready`)
2. 로그인한 앱이 자기 Bearer와 challenge로 Go API에서 30초 **일회용 코드**를 받는다
3. 앱이 WebView로 `/auth/handoff?code=…&next=<경로>`를 연다
4. web 서버가 코드와 cookie의 verifier를 Go API로 교환하고 child 세션 **httpOnly 쿠키**를 심은 뒤 `next`로 redirect한다

- access token을 URL · JS 전역 · `injectJavaScript`로 넘기지 않는다. 코드는 1회용이고 만료가 짧다
- `next`는 같은 도메인 경로만 허용한다 (open redirect 방지). 정해진 경로(`/` · `/history` · `/settings/processing`)와 정확히 같거나 `/history/{jobId}`(소문자 uuid)뿐이다. 하위 경로 · query · 대문자는 받지 않는다. Go · web · mobile이 같은 규칙을 각자 검사한다
- 브라우저 단독 접속은 web 자체 로그인 흐름을 쓰고, 세션 쿠키 형식은 핸드오프와 같다
- verifier가 없는 브라우저로 코드를 열면 교환하지 않는다(login-CSRF 방지). 세션 토큰 · verifier는 bridge · JS로 나가지 않는다

## 앞으로: UI는 API를 직접 모른다

business API가 생기면 아래 형태를 쓴다.

```
UI (component)
  → query / service adapter
    → API 또는 mock
```

- component는 adapter 함수만 부른다. `fetch`도 URL도 모른다
- 화면을 고치지 않고 실제 API와 mock을 바꿔 끼울 수 있어야 한다 — API 전에 화면을 만들고 테스트에서 네트워크를 끊기 위해서다

**mock 프레임워크는 설치하지 않는다.** 필요해지면 adapter와 함께 판단한다.

## Contract 전략

Go와 TypeScript는 타입을 직접 공유할 수 없어 wire 타입을 손으로 둔다. 두 앱이 함께 쓰는 것은 `libs/`(`auth-contracts` · `processing` 등)에 둔다.

**wire 계약의 기준은 Go의 Swagger 2.0 스펙이다**(`apps/api/docs/swagger/swagger.json`, 개발 환경 UI `/swagger/index.html`). route와 문서가 어긋나면 `go test`가 실패한다. 응답 타입을 손으로 베끼는 파일이 여러 개 생기면 이 스펙에서 TS 타입을 생성해 `libs/`에 둔다. **TS 클라이언트 · 타입은 아직 생성하지 않는다.**

**그 전까지 각 앱이 응답 타입을 임의로 늘려 쓰지 않는다.**
