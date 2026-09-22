# WebView 로그인은 일회용 코드로 전달 — 토큰은 넘기지 않음

앱의 로그인 상태는 WebView에 자동 승계되지 않는다. access token을 WebView에 주입하는 대신, 30초짜리 일회용 코드를 교환해 web 서버가 자기 세션 쿠키를 심는 방식.

## 상황

결과 상세 · 기록 화면은 web 한 벌을 앱 WebView로 연다([제품 구성](2026-09-15-native-shell-web-content.md)). 앱은 이미 로그인 상태인데 WebView는 남남 — 사용자가 앱 안에서 다시 로그인하는 일이 발생.

가장 먼저 떠오르는 길은 앱이 가진 access token을 WebView에 넘기는 것.

| 갈래                         | 문제                                                             |
| ---------------------------- | ---------------------------------------------------------------- |
| URL 쿼리에 token             | 주소창 · 서버 로그 · referer에 잔존                              |
| `injectJavaScript` · JS 전역 | 페이지 스크립트가 읽을 수 있고 만료 · 회수 수단이 없음           |
| 일회용 코드 교환             | 왕복이 한 번 늘지만 새어 나가는 것은 코드뿐이고 짧은 만료가 가능 |

## 판단

셋째를 선택. **세션 토큰과 verifier는 bridge · JS로 나가지 않는다.** 흐름은 네 단계.

1. WebView가 `/auth/handoff/start?next=`를 열면 web 서버가 verifier를 **HttpOnly 쿠키**에 두고, ready page가 challenge만 앱에 전달(`handoff-ready`)
2. 로그인한 앱이 자기 Bearer와 challenge로 Go API에서 **30초 일회용 코드**를 수령
3. 앱이 WebView로 `/auth/handoff?code=...&next=<경로>`를 오픈
4. web 서버가 코드와 쿠키의 verifier를 Go API로 교환하고, child 세션 httpOnly 쿠키를 심은 뒤 `next`로 redirect

```
 App             WebView                           Web server      API
  │                 │                                   │           │
  │                 ├──────────── 1. start ─────────────▶           │
  │                 ◀─────────── challenge ─────────────┤           │
  │                 │                                   │           │
  ├──────────────────── 2. bearer + challenge ──────────────────────▶
  ◀───────────────────── one-time code (30s) ───────────────────────┤
  │                 │                                   │           │
  ├ 3. open ?code= ─▶                                   │           │
  │                 │                                   │           │
  │                 ├─────── 4. code + verifier ────────▶           │
  │                 │                                   ├ exchange ─▶
  │                 ◀───── session cookie → next ───────┤           │
```

막아 낸 것은 셋.

- **코드 유출** — 1회용 · 30초 만료. 앱 화면에도 비노출
- **open redirect** — `next`는 같은 도메인 경로만 허용
- **login CSRF** — verifier 없는 브라우저로 코드를 열면 교환 불가. 코드만 가진 다른 브라우저는 세션을 얻지 못한다

## 반영

- Go API에 핸드오프 start · exchange endpoint (`apps/api/internal/auth/handoff.go`)
- web에 ready page · `/auth/handoff` Route Handler (`apps/web/src/lib/auth/handoff.ts`)
- 앱 ↔ WebView 메시지 `auth-required` · `handoff-ready`를 `libs/webview-bridge` 계약에 추가 — 두 세계를 잇는 것은 이 계약과 URL뿐
- 현재 규칙은 데이터 접근 문서의 [WebView 로그인 핸드오프](../architecture/data-access.md#webview-로그인-핸드오프)에 기재

## 검증

- api · web 단위 테스트, 그리고 E2E에 "다른 브라우저로 연 핸드오프 코드는 세션을 만들지 않는다" 포함
- 로그 검사도 병행 — 실패 경로 로그에 code · state · credential 원문이 남지 않는지 확인
