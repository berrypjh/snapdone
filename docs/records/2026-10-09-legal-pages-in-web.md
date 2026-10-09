# 이용약관 · 개인정보처리방침을 web 페이지로 제공

production 로그인에는 약관 문서 두 개의 https 주소가 필요. web에 `/terms` · `/privacy`를 두고 그 주소를 `TERMS_URL` · `PRIVACY_URL`로 사용.

## 상황

- **로그인 조건** — production web은 `TERMS_URL` · `PRIVACY_URL`이 모두 https일 때만 로그인 버튼 활성(`isSignUpAllowed`)
- **문서 없음** — 첫 배포 시점에 약관 · 방침이 없어 로그인 비활성

## 판단

- **web 페이지** — 코드와 함께 버전 관리. 시행일을 api 동의 버전과 같은 값으로 맞춤
- **`(auth)` 그룹** — nav 없는 화면. 로그인 없이 열림
- **사실만 기재** — Google 로그인 범위는 `openid` 하나(이메일 · 이름 미수집), 사진은 저장하지 않고 SHA-256만, 처리는 Anthropic에 위탁
- **탈퇴는 이메일 요청** — 탈퇴 기능이 없음

## 반영

- **페이지** — `apps/web/src/app/(auth)/terms/page.tsx` · `privacy/page.tsx`, 공용 틀 `components/legal/`
- **설정** — `apps/web/service.yaml`의 `TERMS_URL` · `PRIVACY_URL`

## 검증

- `nx typecheck` · `nx lint` · `nx test` web 통과
- **배포 확인** — 로그인 화면에 약관 링크와 활성 Google 버튼, 앱 로그인 성공
- **남은 것** — 문서 내용은 법률 검토 전 초안
