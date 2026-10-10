# GitHub Actions CI와 main 머지 자동 배포 추가

검사와 배포가 모두 수동이었음. PR마다 바뀐 프로젝트를 검사하고, main에 머지되면 바뀐 api · web을 배포하도록 변경.

## 상황

- **검사 누락** — 로컬 검사에 의존. DB 테스트 · e2e는 AI 세션에서 돌지 않음
- **배포 이미지 미검증** — Dockerfile이 깨져도 배포할 때야 드러남
- **수동 배포** — `deploy.sh`를 로컬에서 실행. 커밋하지 않은 코드가 배포될 수 있음

## 판단

- **affected만 검사** — `nx affected` + `nrwl/nx-set-shas`. 기준은 마지막으로 성공한 main 실행
- **잡 분리** — `checks`(정적 검사 · 단위 · DB 테스트 · build) · `e2e` · `docker`(push 없이 이미지 빌드)를 병렬
- **배포는 같은 워크플로의 마지막 잡** — `deploy`가 세 잡 통과 뒤에만 실행. 바뀐 프로젝트 목록은 `docker` 잡 결과를 받아 씀
- **`deploy.sh` 재사용** — 수동 배포와 같은 경로. 프로젝트 · 리전은 `CLOUDSDK_*` 환경 변수로 전달
- **키 파일 없는 인증** — Workload Identity Federation. 이 저장소의 main 실행만 허용
- **main은 취소하지 않음** — PR은 새 push가 이전 실행을 취소, main은 마이그레이션 도중 끊기지 않게 유지
- **main 보호 규칙** — PR 필수, `checks` · `e2e` · `docker` 통과 필수, force push 차단

## 반영

- **워크플로** — `.github/workflows/ci.yml`
- **GCP** — 배포 계정 `github-deploy`, WIF 풀 `github`
- **GitHub** — Variables `GCP_PROJECT_ID` · `GCP_WIF_PROVIDER` · `GCP_DEPLOY_SA`, main ruleset

## 검증

- **첫 실행** — 네 잡 성공. 워크플로 · 문서만 바뀐 머지에서 `deploy`의 GCP 로그인 · docker 인증까지 확인, 배포 단계는 건너뜀
- **실제 배포** — api · web 코드가 바뀐 첫 머지에서 확인
