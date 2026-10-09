# api · web을 Cloud Run에, DB를 Cloud SQL에 배포

api · web은 Cloud Run 서비스, DB는 Cloud SQL. 서비스 설정은 저장소 yaml, 비밀 값은 Secret Manager, 반복 배포는 스크립트 한 줄. 절차는 [deployment.md](../development/deployment.md)

## 상황

- **배포 없음** — production 배포 · DB · Dockerfile 없음
- **web** — 서버에서 api를 호출해 정적 호스팅 불가
- **모노레포** — web은 `libs/`와 루트 lockfile에 의존, api는 독립 Go 모듈
- **비공개 패키지** — web 빌드에 GitHub Packages 토큰 필요

## 판단

- **Cloud Run 두 서비스** — 앱마다 컨테이너 하나. 두 플랫폼 관례 유지
- **마이그레이션은 Job** — api는 미적용 마이그레이션이 있으면 기동 거부. 서비스 전에 같은 이미지의 `/migrate` 실행
- **로컬 빌드 후 push** — `GITHUB_TOKEN`을 BuildKit secret으로만 넘김
- **설정 파일 + Secret Manager** — 비밀 값은 이름만 참조. 프로젝트 식별자는 `${...}` 자리로 두어 public 저장소에 커밋 가능
- **CI · Terraform 보류** — 수동 배포가 자리 잡은 뒤

## 반영

- **이미지** — `apps/api/Dockerfile`(distroless), `apps/web/Dockerfile`(filter 설치 · standalone), `.dockerignore`
- **서비스** — `apps/api/service.yaml` · `migrate-job.yaml` · `apps/web/service.yaml`
- **스크립트** — `tools/scripts/deploy.sh`
- **Cloud SQL** — PostgreSQL 17. 처음 만든 18 인스턴스가 DB 생성 · 조회 모두 실패해 다른 이름으로 다시 생성

## 검증

- **배포** — api `GET /health` `200`, web `/login` `200`
- **이후 확인** — Android 내부 APK에서 로그인 · 사진 처리 · 기록이 production으로 동작
