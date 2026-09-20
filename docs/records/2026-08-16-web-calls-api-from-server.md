# 브라우저는 Go API를 직접 부르지 않는다

`apps/web`은 Go API를 **서버에서만** 부른다. 그 결과로 CORS 설정이 저장소에 하나도 없고, base URL이 브라우저 번들에 들어가지 않는다.

## 상황

web과 Go API는 다른 프로세스다. 브라우저 화면이 그 데이터를 얻는 길이 셋 있었다.

| 갈래                                           | 딸려 오는 것                                               |
| ---------------------------------------------- | ---------------------------------------------------------- |
| 브라우저 → Go API 직접                         | 허용 origin 설정, credential 정책, `NEXT_PUBLIC_` base URL |
| 브라우저 → Next 프록시 route(`app/api/*`)      | 중간 계층 한 겹, 같은 바이트를 두 번 전송                  |
| Server Component · Server Action에서 직접 호출 | 없음. 서버 대 서버라 origin 검사 자체가 없다               |

## 판단

셋째를 골랐다. 읽기는 Server Component, 로그인 시작 · 로그아웃은 Server Action, OAuth 복귀는 `/auth/callback` Route Handler가 부른다.

- base URL은 `API_BASE_URL`이고 **`NEXT_PUBLIC_` 접두사가 없다.** 브라우저 번들에 들어갈 이유가 없다
- **CORS 설정을 만들지 않았다.** 지금 필요하지 않기 때문만은 아니다 — 쓰이지 않는 CORS middleware는 잘못된 설정을 숨긴 채 통과시키는 통로가 되기 쉽다
- 프록시 route도 만들지 않았다. Server Component가 직접 부르면 되는 일에 중간 계층을 두지 않는다

앱 WebView 안에서 web 화면이 열려도 이 경로는 그대로다. WebView는 브라우저이고, web은 여전히 서버에서 API를 부른다. 반대로 `apps/mobile`에는 서버가 없으니 앱은 항상 직접 부른다 — 같은 제품의 두 클라이언트가 다른 규칙을 갖는다.

## 다시 볼 때

브라우저가 Go API를 **직접** 불러야 하는 상황이 생기면 바뀐다. 가장 유력한 계기는 이미지 업로드다 — 큰 파일을 Next 서버를 거쳐 보내면 같은 바이트를 두 번 전송한다. 그때는 `NEXT_PUBLIC_API_BASE_URL` 추가 · Go의 허용 origin 설정 · 환경별 origin 분리 · credential 정책 명시를 함께 하고, production에서 `*`를 쓰지 않는다.

**온보딩 첫 사진(2026-09-19)은 이 전환 없이 Server Action으로 올린다.** 사진 한 장(최대 7,500,000 byte)을 한 번 받는 흐름이라, 두 번 전송하는 비용보다 CORS와 브라우저 credential 정책을 새로 여는 비용이 크다고 봤다. 본문 상한은 `next.config.js`의 `serverActions.bodySizeLimit`(`8mb`)이고 브라우저가 넘는 파일을 보내기 전에 거절한다. 여러 장 · 반복 업로드가 생기면 위 절차로 다시 본다.

## 근거

규칙과 재검토 조건은 [데이터 접근 문서](../architecture/data-access.md)에 있다. 이 기록은 그 결정을 언제 · 왜 그렇게 정했는지를 남긴다.
