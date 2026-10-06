# 네이티브 셸 + 웹 콘텐츠로 제품 분할

mobile이 주 제품. web은 브라우저 단독 서비스이면서 앱 안 WebView로도 열린다. 같은 화면을 두 번 만들지 않되, 앱다운 부분은 네이티브로 유지.

## 상황

제품은 사진 한 장으로 하려던 일을 끝내 주는 앱. 만들 것은 하나인데 클라이언트는 둘(앱 · 브라우저) — 어느 영역을 네이티브로 두고 어느 영역을 web 한 벌로 둘지 결정이 필요했다. 정하지 않으면 두 벌을 계속 만들거나, 반대로 앱이 웹 껍데기가 된다.

## 판단

하이브리드 앱에서 가장 보편적인 분담을 채택.

| 영역                                         | 담당                              | 이유                                                                       |
| -------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------- |
| 탭 · 스택 네비게이션, 로그인, 권한, 푸시     | mobile 네이티브                   | 앱다운 사용감, 스토어 심사(App Store 4.2 최소 기능) 안전                   |
| Capture → Understand → Route → Act 핵심 흐름 | mobile 네이티브                   | 카메라 · 사진 · 공유 시트는 네이티브 API이고 제품의 무게중심이 여기에 있음 |
| 결과 상세 · 기록 · 공지 · 약관 · 설정 일부   | web 한 벌 → 브라우저 + 앱 WebView | 스토어 배포 없이 수정, 코드는 한 벌                                        |
| 브라우저 단독 접속                           | web 전체                          | URL 공유, 서버 렌더링된 첫 HTML                                            |

표의 담당은 **앱 안에서 누가 그리는가**를 말한다. 브라우저로 직접 들어오면 web이 핵심 흐름까지 맡는다 — 카메라 대신 파일 선택으로 사진을 받고, 온보딩 순서(목적 → 첫 사진 → 처리)는 앱과 동일. 진행 상태는 서버에 있어 어느 쪽에서 시작해도 이어진다([`apps/web`의 책임](../architecture/target-architecture.md#appsweb--nextjs)).

![앱 안의 WebView와 브라우저가 같은 web 한 벌을 연다](images/native-shell-web-content.svg)

**무게중심이 Act에 있다는 제품 판단이 그대로 경계가 됐다.** 하려던 일을 끝내는 흐름은 네이티브, 끝난 뒤 읽는 화면은 web.

## 반영

두 앱은 **코드로 서로를 참조하지 않음.** 연결 고리는 URL과 메시지 계약뿐이고 공유는 `libs/`로만 — DOM 컴포넌트 · RN 컴포넌트 · CSS · 플랫폼 API는 공유 대상이 아니다.

- Web UI를 React Native에 그대로 복제하지 않음. 같은 것은 사용자가 얻는 결과이지 화면 구조가 아니다
- 경계는 Nx tag(`type:app` · `type:lib`)와 루트 ESLint 설정이 강제
- 새 lib은 두 번째 사용처가 실제로 나타났을 때 생성 — `libs/`에 있는 것은 전부 그렇게 생겼다. 미리 만들지 않는다
- 현재 규칙은 대상 아키텍처 문서의 [제품 구성 — 네이티브 셸 + 웹 콘텐츠](../architecture/target-architecture.md#제품-구성--네이티브-셸--웹-콘텐츠)에 기재

## 검증

- 두 세계를 잇는 계약은 테스트가 보증 — 앱이 붙이는 User-Agent 토큰을 web이 알아보는지, WebView가 web origin 밖에서 온 메시지를 무시하는지
- 브라우저 단독으로 흐름이 이어지는지는 E2E가 확인 — 브라우저 사용자가 소개에서 목적을 지나 첫 사진까지 도달
- 경계 자체는 테스트가 아니라 도구가 차단. Nx tag와 ESLint 설정이 `type:app` 사이의 import를 금지

## 참고자료

- [App Review Guidelines 4.2 Minimum Functionality](https://developer.apple.com/app-store/review/guidelines/) — Apple. "Your app should include features, content, and UI that elevate it beyond a repackaged website." 4.2.2는 web clipping을 따로 지목
