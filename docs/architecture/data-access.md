# Data Access

앱이 API와 이야기하는 방식의 규칙이다. 지금 존재하는 endpoint는 `GET /health` 하나뿐이므로, 이 문서는 **구현보다 규칙이 앞서 있는 상태**다.

## 지금 있는 것

| 위치                                 | 역할                                                   |
| ------------------------------------ | ------------------------------------------------------ |
| `apps/web/src/lib/api.ts`            | web이 base URL을 읽고 `/health`를 호출하는 유일한 지점 |
| `apps/mobile/src/lib/api.ts`         | mobile 쪽 같은 역할                                    |
| `tools/scripts/check-api-health.mjs` | 개발자용 연결 확인 명령 (`pnpm health`)                |

HTTP 클라이언트 라이브러리는 없다. Node 24와 React Native 0.85 모두 `fetch`를 기본 제공하므로 `/health` 하나 때문에 axios를 넣지 않는다.

`pnpm health`는 URL을 자기가 조립하지 않고 **web 앱의 `fetchHealth`를 그대로 호출한다.** 스크립트가 통과했다는 것은 앱이 쓰는 코드 경로가 통과했다는 뜻이다. 검증용 사본을 따로 두면 진짜 코드가 깨져도 스크립트는 초록불이 된다.

제품 화면에는 health 상태를 노출하지 않는다. API 상태는 사용자가 알아야 할 정보가 아니다.

## 규칙

**URL 문자열을 화면 코드에 쓰지 않는다.** component는 `lib/api`가 노출하는 함수만 부른다. base URL을 아는 파일은 앱당 하나뿐이다.

**환경변수가 없으면 조용히 넘어가지 않는다.** base URL이 비어 있으면 두 앱 모두 무엇을 복사해야 하는지 알려주는 오류를 던진다. `localhost` fallback을 코드에 박으면 잘못된 설정이 배포될 때까지 드러나지 않는다.

**`any`를 쓰지 않는다.** 응답은 좁은 타입 가드로 확인한다. 지금은 `Health` 하나뿐이며, 이걸 위해 코드 생성기나 공유 contract 패키지를 만들지 않는다.

## Web은 서버에서 호출한다

`apps/web`은 **Server Component에서** Go API를 호출한다. 브라우저는 Go API를 직접 부르지 않는다.

그래서:

- base URL은 `API_BASE_URL`이다. **`NEXT_PUBLIC_` 접두사가 없다.** 브라우저 번들에 들어갈 이유가 없다
- **CORS 설정이 필요 없다.** 서버 대 서버 요청에는 origin 검사가 없다
- 프록시 route(`app/api/*`)도 만들지 않았다. Server Component가 직접 부르면 되는 일에 중간 계층을 두지 않는다

이 선택은 AGENTS.md의 "Server Component를 기본으로 생각하고, browser interaction이 필요한 부분만 Client Component로 내린다"를 그대로 따른 것이다.

### 언제 이 결정을 다시 볼 것인가

브라우저가 Go API를 **직접** 불러야 하는 상황이 생기면 바뀐다. 가장 유력한 계기는 **이미지 업로드**다. 큰 파일을 Next 서버를 거쳐 보내면 같은 바이트를 두 번 전송하게 된다.

그때 함께 해야 하는 일:

1. `NEXT_PUBLIC_API_BASE_URL` 추가 (브라우저가 알아야 하므로)
2. Go에 허용 origin 설정 — `API_ALLOWED_ORIGIN`을 읽어서 처리
3. development와 production origin을 나눠서 관리
4. credential 정책을 명시 (쿠키를 보낼 것인가)
5. **production에서 `*`를 쓰지 않는다**

**지금 미리 만들지 않는다.** 쓰이지 않는 CORS middleware는 잘못된 설정을 숨긴 채 통과시키는 통로가 되기 쉽다.

## Mobile은 항상 직접 호출한다

`apps/mobile`에는 서버가 없다. 앱이 Go API를 직접 부른다.

- base URL은 `EXPO_PUBLIC_API_BASE_URL`이다. **앱 번들에 인라인되므로 공개값이다.** secret을 두지 않는다
- `process.env.EXPO_PUBLIC_API_BASE_URL`은 **직접 프로퍼티 접근으로만** 쓴다. Expo가 빌드 시 이 표현식을 그대로 치환하므로 `process.env[key]` 같은 동적 접근은 실제 빌드에서 `undefined`가 된다
- 브라우저가 아니므로 CORS와 무관하다
- `localhost`, `10.0.2.2`, 사설 IP를 **코드에 넣지 않는다.** 기기별 차이는 `.env`로 해결한다 ([local-development.md](../development/local-development.md) 참조)

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

Go와 TypeScript는 언어가 달라 타입을 직접 공유할 수 없다. 지금은 `{ status: string }` 하나뿐이라 각 앱에 작은 타입을 손으로 두었다.

endpoint가 늘어나면 이 방식은 무너진다. 응답 타입을 손으로 베껴 쓰는 파일이 여러 개 생기는 순간이 전략을 도입할 시점이다. 그때 후보는 OpenAPI 스펙에서 TS 타입을 생성하는 방식이며, 생성물을 두는 위치는 `libs/`가 된다.

**그 전까지 각 앱이 응답 타입을 임의로 늘려 쓰지 않는다.**
