# 브라우저는 Go API를 직접 호출하지 않음

`apps/web`은 Go API를 **서버에서만** 호출. 세션이 HttpOnly 쿠키에 있고 서버가 그것을 `Bearer`로 바꿔 붙이므로 **자격증명이 브라우저 스크립트에 한 번도 닿지 않는다.** 딸려 오는 결과로 CORS 설정이 저장소에 하나도 없고 base URL도 번들에 들어가지 않는다.

## 상황

web과 Go API는 별개 프로세스. 브라우저 화면이 그 데이터를 얻는 길은 셋.

| 갈래                                           | 딸려 오는 것                                               |
| ---------------------------------------------- | ---------------------------------------------------------- |
| 브라우저 → Go API 직접                         | 허용 origin 설정, credential 정책, `NEXT_PUBLIC_` base URL |
| 브라우저 → Next 프록시 route(`app/api/*`)      | 중간 계층 한 겹, 같은 바이트를 두 번 전송                  |
| Server Component · Server Action에서 직접 호출 | 없음. 서버 대 서버라 origin 검사 자체가 없음               |

## 판단

셋째를 선택. **결정적인 이유는 세션.**

web의 세션은 HttpOnly 쿠키에 있다. JS가 읽을 수 없고, 서버가 그 쿠키를 읽어 `Authorization: Bearer`로 바꿔 Go에 붙인다. 자격증명이 브라우저 스크립트에 한 번도 닿지 않는다.

쿠키에는 `sameSite: 'lax'`가 걸려 있다. **다른 사이트에서 시작된 POST · fetch에는 브라우저가 이 쿠키를 붙이지 않는다**는 뜻이라, 상태를 바꾸는 요청(전부 POST인 Server Action)이 CSRF로부터 거저 보호된다. 로그인 복귀처럼 다른 사이트에서 오는 top-level 이동에는 따라붙으므로 `/auth/callback`은 그대로 동작한다.

브라우저가 Go를 직접 부르려면 둘 중 하나가 필요한데, 둘 다 이 성질을 잃는다.

- **쿠키를 교차 출처로 전송** — Go는 다른 출처이므로 `lax`에서는 쿠키가 가지 않는다. 보내려면 `SameSite=None; Secure`로 바꾸고 CORS에 credential을 허용해야 하는데, 그 순간 위의 CSRF 보호가 사라진다
- **토큰을 JS에 전달** — XSS 한 번이면 그대로 유출. HttpOnly를 쓰는 이유가 사라진다

세션을 지키고 나면 나머지는 따라온다. **쓰지 않는 CORS middleware는 만들지 않는다** — 잘못된 설정을 숨긴 채 통과시키는 통로가 되기 쉽다. 프록시 route도 같은 이유로 미도입.

반대로 `apps/mobile`은 Go를 직접 부른다. 앱에는 서버가 없기도 하지만, **위 두 위험이 아예 성립하지 않기 때문**이다.

|                    | 브라우저 (web)                           | 앱 (mobile)                      |
| ------------------ | ---------------------------------------- | -------------------------------- |
| 자격증명이 사는 곳 | HttpOnly 쿠키 — 서버만 읽음              | Keychain · Keystore — 앱만 읽음  |
| CSRF               | 쿠키가 자동으로 붙어 성립 → `lax`로 차단 | 자동으로 붙는 것이 없어 미성립   |
| 스크립트 탈취      | 페이지에서 도는 스크립트가 읽을 수 있음  | 남의 스크립트가 도는 자리가 없음 |

두 클라이언트가 **같은 성질을 다른 수단으로** 지킨다 — 토큰을 만지는 주체를 하나로 좁히는 것. 앱은 `expo-secure-store`에 넣고 꺼낼 때만 `Bearer`로 붙인다.

위험이 돌아오는 자리는 앱 안의 **WebView**다. 그래서 토큰을 WebView에 넘기지 않고 일회용 코드로 교환한다([WebView 로그인 핸드오프](2026-09-16-webview-login-handoff.md)). WebView 안에서 열린 web 화면도 여전히 서버에서 API를 부른다.

## 반영

- 읽기는 Server Component, 로그인 시작 · 로그아웃은 Server Action, OAuth 복귀는 `/auth/callback` Route Handler가 담당
- base URL은 `API_BASE_URL`이고 **`NEXT_PUBLIC_` 접두사가 없음.** 브라우저 번들에 들어갈 이유가 없다
- CORS middleware도, 프록시 route(`app/api/*`)도 미도입
- 규칙과 재검토 조건은 [데이터 접근 문서](../architecture/data-access.md#web은-서버에서-호출한다)에 기재

## 검증

- 업로드처럼 브라우저가 직접 부를 법한 흐름도 서버를 거친다는 것이 테스트로 고정 — 사진은 Server Action의 multipart 필드로 전송되고, Go 상한을 넘는 파일은 보내기 전에 거절
- 브라우저가 Go를 직접 부르지 않는다는 것 자체를 보는 검사는 없음. CORS 설정 파일이 없다는 사실이 그 자리를 대신한다

## 재검토 조건

브라우저가 Go API를 **직접** 불러야 하는 상황이 생기면 전환. 부딪히는 자리는 넷.

- **큰 파일** — Next 서버를 거치면 같은 바이트를 두 번 전송. 업로드는 결국 스토리지 presigned URL로 가는데, 그것은 브라우저 → 스토리지라 API 직접 호출과는 다른 이야기
- **실시간** — SSE · WebSocket을 중계하면 홉이 하나 늘고 연결을 유지하는 계층을 따로 키워야 함
- **클라이언트 갱신** — 무한 스크롤 · 낙관적 UI처럼 브라우저가 스스로 데이터를 더 받아야 하는 화면이 생기면 Route Handler를 좁게 개방
- **서버 비용** — 모든 상호작용이 Next를 경유. 트래픽이 커지면 그 계층도 같이 커진다

전환할 때 함께 하는 일은 넷 — `NEXT_PUBLIC_API_BASE_URL` 추가, Go의 허용 origin 설정, 환경별 origin 분리, credential 정책 명시. production에서 `*`를 쓰지 않는다.

**무엇이 바뀌어도 지키는 것은 하나 — 세션 자격증명이 브라우저 스크립트에 닿지 않는다.** 직접 호출을 열더라도 쿠키를 그대로 쓰거나(같은 사이트 배포), 수명이 짧은 별도 토큰을 쓰거나, 그 호출만 Route Handler로 감싼다. "서버에서만 부른다"는 문장이 아니라 이 성질이 이 기록의 본체다.

**온보딩 첫 사진(2026-09-19)은 이 전환 없이 Server Action으로 올린다.** 사진 한 장(최대 7,500,000 byte)을 한 번 받는 흐름이라, 두 번 전송하는 비용보다 CORS와 브라우저 credential 정책을 새로 여는 비용이 크다고 봤다. 본문 상한은 `next.config.js`의 `serverActions.bodySizeLimit`(`8mb`)이고 브라우저가 넘는 파일을 보내기 전에 거절한다. 여러 장 · 반복 업로드가 생기면 위 절차로 다시 본다.

## 참고자료

- [Environment Variables](https://nextjs.org/docs/app/guides/environment-variables) — Next.js. "By default, environment variables are only available on the server." 브라우저에 내보내려면 `NEXT_PUBLIC_`를 붙여야 하고, 그 값은 빌드 시 번들에 고정
