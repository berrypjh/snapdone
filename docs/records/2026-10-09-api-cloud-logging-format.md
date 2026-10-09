# api 로그를 Cloud Logging 형식(severity · message · release)으로 변경

api 로그의 심각도가 Cloud Logging에서 비어 있었음. slog 키를 Cloud Logging 이름으로 바꾸고 배포 이미지 태그를 모든 줄에 남김.

## 상황

- **심각도 없음** — slog JSON은 `level` · `msg`로 쓰지만 Cloud Logging은 `severity` · `message`를 읽음. 오류만 거르거나 경보를 걸 수 없음
- **배포 구분 없음** — 실행 중인 api가 어느 배포인지 로그에 없음

## 판단

- **키 이름만 변경** — `ReplaceAttr`로 `level` → `severity`(WARN → `WARNING`), `msg` → `message`. 의존성 추가 없음
- **release는 환경 변수** — `deploy.sh`가 이미지 태그를 `APP_RELEASE`로 넣음

## 반영

- **코드** — `apps/api/internal/logging`의 `New`, `cmd/server/main.go`
- **배포** — `deploy.sh`의 `${RELEASE}`, `apps/api/service.yaml`의 `APP_RELEASE`

## 검증

- **단위 테스트** — 심각도별 키 이름, release 유무
- **배포 확인** — api 로그가 `severity=INFO` · `message` · `release`로 읽힘
