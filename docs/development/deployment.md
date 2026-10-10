# Deployment

api · web을 GCP에 배포하는 구성과 절차. mobile 스토어 배포는 범위 밖. 구성을 고른 이유는 [기록](../records/2026-10-09-cloud-run-deployment.md)

## 구성

| 대상         | GCP                         | 비고                                         |
| ------------ | --------------------------- | -------------------------------------------- |
| `apps/api`   | Cloud Run 서비스 `api`      | 공개. 앱 · OAuth callback이 직접 호출        |
| `apps/web`   | Cloud Run 서비스 `web`      | 공개. api를 서버에서 호출                    |
| 마이그레이션 | Cloud Run Job `api-migrate` | api 이미지의 `/migrate`. 서비스 배포 전 실행 |
| DB           | Cloud SQL PostgreSQL 17     | Unix 소켓 연결. 로컬 compose는 18            |
| secret       | Secret Manager              | yaml에는 이름만                              |
| 이미지       | Artifact Registry           | 저장소 `snapdone`                            |

- **리전** — `asia-northeast3`
- **주소** — `https://<서비스>-<PROJECT_NUMBER>.asia-northeast3.run.app`. 배포 전에 정해지는 형식

## 저장소 파일

| 파일                        | 역할                                                                 |
| --------------------------- | -------------------------------------------------------------------- |
| `apps/api/Dockerfile`       | 컨텍스트 `apps/api`. `server` · `migrate` 정적 빌드                  |
| `apps/web/Dockerfile`       | 컨텍스트 저장소 루트. web과 root만 설치, `.next/standalone`으로 실행 |
| `apps/api/service.yaml`     | api 서비스 — env · secret 참조 · Cloud SQL 연결                      |
| `apps/api/migrate-job.yaml` | 마이그레이션 Job                                                     |
| `apps/web/service.yaml`     | web 서비스 — env                                                     |
| `tools/scripts/deploy.sh`   | 빌드 → push → (api는 마이그레이션) → `gcloud run services replace`   |

- **`${...}` 자리** — `PROJECT_ID` · `PROJECT_NUMBER` · `REGION` · `IMAGE` · `RELEASE`를 `deploy.sh`가 `gcloud config`와 이미지 태그로 채움
- **이미지 태그** — `<날짜시각>-<커밋 해시>`. api에 `APP_RELEASE`로 들어가 로그의 `release`가 됨
- **`GOOGLE_CLOUD_PROJECT`** — api 요청 로그에 trace를 붙여 Cloud Logging에서 같은 요청끼리 묶임
- **`REPLACE_ME`** — 남아 있으면 `deploy.sh`가 중단

## 최초 인프라

한 번만 실행.

```bash
gcloud config set project <PROJECT_ID>
gcloud config set run/region asia-northeast3

gcloud services enable run.googleapis.com sqladmin.googleapis.com \
  artifactregistry.googleapis.com secretmanager.googleapis.com
gcloud artifacts repositories create snapdone --repository-format=docker --location=asia-northeast3
gcloud auth configure-docker asia-northeast3-docker.pkg.dev

gcloud sql instances create snapdone-pg --database-version=POSTGRES_17 \
  --edition=ENTERPRISE --tier=db-f1-micro --region=asia-northeast3
gcloud sql databases create snapdone --instance=snapdone-pg
DB_PASS=$(openssl rand -hex 16)
gcloud sql users create snapdone --instance=snapdone-pg --password="${DB_PASS}"

printf '%s' "postgres://snapdone:${DB_PASS}@/snapdone?host=/cloudsql/<PROJECT_ID>:asia-northeast3:snapdone-pg" \
  | gcloud secrets create DATABASE_URL --data-file=-
printf '%s' "$(openssl rand -base64 32)" | gcloud secrets create AUTH_ENCRYPTION_KEY --data-file=-
printf '%s' '<OAuth 클라이언트 보안 비밀번호>' | gcloud secrets create GOOGLE_CLIENT_SECRET --data-file=-
printf '%s' '<Anthropic API 키>' | gcloud secrets create PROCESSING_API_KEY --data-file=-
printf '%s' '<Sentry DSN>' | gcloud secrets create SENTRY_DSN --data-file=-
printf '%s' '<web Sentry DSN>' | gcloud secrets create WEB_SENTRY_DSN --data-file=-

SA=<PROJECT_NUMBER>-compute@developer.gserviceaccount.com
gcloud projects add-iam-policy-binding <PROJECT_ID> --member=serviceAccount:${SA} --role=roles/secretmanager.secretAccessor
gcloud projects add-iam-policy-binding <PROJECT_ID> --member=serviceAccount:${SA} --role=roles/cloudsql.client
```

- **zsh** — `$VAR:a`는 경로 수식어로 해석됨. 변수는 `${VAR}`로 감싸거나 값을 그대로 적음
- **`AUTH_ENCRYPTION_KEY`** — 바꾸면 이미 암호화한 값을 읽지 못함
- **`WEB_SENTRY_DSN`** — 브라우저 번들에 들어가는 공개 값. `deploy.sh web`이 빌드 때 읽음
- **OAuth 클라이언트** — 웹 애플리케이션, 리디렉션 URI `https://api-<PROJECT_NUMBER>.asia-northeast3.run.app/v1/auth/oauth/callback`

## 배포

```bash
tools/scripts/deploy.sh api   # 빌드 · push · 마이그레이션 · 서비스 적용
tools/scripts/deploy.sh web   # GITHUB_TOKEN(read:packages) 필요
curl https://api-<PROJECT_NUMBER>.asia-northeast3.run.app/health
```

- **필요 조건** — `gcloud` 로그인, Docker 실행
- **마이그레이션 실패** — 서비스 적용 전에 중단. 이전 revision 유지
- **`/health` 200** — api는 미적용 마이그레이션이 있으면 기동 거부. DB까지 정상이라는 뜻

## 자동 배포

main에 머지되면 CI(`.github/workflows/ci.yml`)의 `deploy` 잡이 실행. `checks` · `e2e` · `docker`가 모두 통과한 뒤, 바뀐 api · web만 `deploy.sh`로 배포

- **인증** — Workload Identity Federation. 키 파일 없음. 이 저장소의 main 실행만 허용
- **배포 계정** — `github-deploy`. `run.admin` · `artifactregistry.writer` · `browser`(프로젝트 번호 조회), 런타임 계정(compute)의 `serviceAccountUser`, secret `WEB_SENTRY_DSN`의 `secretAccessor`(web 빌드에 넣음)
- **GitHub Variables** — `GCP_PROJECT_ID` · `GCP_WIF_PROVIDER` · `GCP_DEPLOY_SA`. 저장소 코드에 프로젝트 값을 두지 않음
- **배포 실패** — 그 실행이 실패로 남아 다음 main 실행의 affected 범위에 다시 포함
- **수동 배포** — `deploy.sh`는 그대로 사용 가능

최초 설정 (한 번만)

```bash
PROJECT_ID=$(gcloud config get-value project)
PROJECT_NUMBER=$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')
REPO=<owner>/<repo>
gcloud services enable iamcredentials.googleapis.com sts.googleapis.com

gcloud iam workload-identity-pools create github --location=global
gcloud iam workload-identity-pools providers create-oidc snapdone \
  --location=global --workload-identity-pool=github \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
  --attribute-condition="assertion.repository=='${REPO}' && assertion.ref=='refs/heads/main'"

gcloud iam service-accounts create github-deploy
DEPLOY_SA=github-deploy@${PROJECT_ID}.iam.gserviceaccount.com
for role in roles/run.admin roles/artifactregistry.writer roles/browser; do
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${DEPLOY_SA}" --role="${role}" --condition=None
done
gcloud iam service-accounts add-iam-policy-binding \
  "${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --member="serviceAccount:${DEPLOY_SA}" --role=roles/iam.serviceAccountUser
gcloud secrets add-iam-policy-binding WEB_SENTRY_DSN \
  --member="serviceAccount:${DEPLOY_SA}" --role=roles/secretmanager.secretAccessor
gcloud iam service-accounts add-iam-policy-binding "${DEPLOY_SA}" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github/attribute.repository/${REPO}"
```

`GCP_WIF_PROVIDER` 값은 `gcloud iam workload-identity-pools providers describe snapdone --location=global --workload-identity-pool=github --format='value(name)'`

## 되돌리기

배포 뒤 문제가 생기면 이전 revision으로 트래픽을 돌림. 이미지를 다시 빌드하지 않음

```bash
gcloud run revisions list --service=api
gcloud run services update-traffic api --to-revisions=<이전 revision>=100
```

- **복귀** — 고친 코드를 머지하면 새 revision이 다시 트래픽 100%
- **어느 배포인지** — 로그 · Sentry 이벤트의 `release`가 이미지 태그
- **DB 마이그레이션** — 자동으로 되돌리지 않음. 이전 코드와도 동작하게(추가 위주로) 작성
- **mobile(EAS Update)** — `npx eas-cli@latest update:republish`로 이전 업데이트를 다시 보냄

## 설정 변경

| 대상                            | 방법                                                             |
| ------------------------------- | ---------------------------------------------------------------- |
| 공개 값(모델 · 약관 버전 · URL) | `service.yaml` 수정 · 커밋 → `deploy.sh`                         |
| 비밀 값                         | `gcloud secrets versions add <이름> --data-file=-` → `deploy.sh` |
| 코드                            | api는 `deploy.sh api`, web · `libs/`는 `deploy.sh web`           |

- **`AUTH_*` · `PROCESSING_*`** — 일부만 있으면 api 기동 거부
- **`TERMS_URL` · `PRIVACY_URL`** — production web은 둘 다 https일 때만 로그인 활성
- **약관 개정** — web `legal-copy.ts`의 시행일과 api `AUTH_TERMS_VERSION` · `AUTH_PRIVACY_VERSION`을 함께 올림
- **YAML 날짜 값** — 따옴표로 감쌈(`"2026-10-09"`)

## Android 내부 테스트 빌드

스토어 없이 설치하는 APK. `eas.json`의 `preview` 프로필

1. `apps/mobile`에서 `npx eas-cli@latest init` (최초 1회)
2. 환경 변수를 EAS에 등록 — `.env`는 빌드 서버로 올라가지 않음

```bash
npx eas-cli@latest env:create --environment preview --visibility plaintext --name EXPO_PUBLIC_API_BASE_URL --value https://api-<PROJECT_NUMBER>.asia-northeast3.run.app
npx eas-cli@latest env:create --environment preview --visibility plaintext --name EXPO_PUBLIC_WEB_BASE_URL --value https://web-<PROJECT_NUMBER>.asia-northeast3.run.app
npx eas-cli@latest env:create --environment preview --visibility plaintext --name EXPO_PUBLIC_AUTH_REDIRECT_URI --value mobile://auth/callback
npx eas-cli@latest env:create --environment preview --visibility plaintext --name EXPO_PUBLIC_TERMS_URL --value https://web-<PROJECT_NUMBER>.asia-northeast3.run.app/terms
npx eas-cli@latest env:create --environment preview --visibility plaintext --name EXPO_PUBLIC_PRIVACY_URL --value https://web-<PROJECT_NUMBER>.asia-northeast3.run.app/privacy
npx eas-cli@latest env:create --environment preview --visibility plaintext --name EXPO_PUBLIC_SENTRY_DSN --value <mobile Sentry DSN>
npx eas-cli@latest env:create --environment preview --visibility secret --name GITHUB_TOKEN --value <read:packages 토큰>
```

3. 저장소 루트에서 `pnpm exec nx build mobile --platform=android --profile=preview`
4. 빌드 링크의 APK 설치. Play 프로텍트 · 삼성 자동 차단이 막으면 설치하는 동안만 끔

- **iPhone** — 유료 Apple Developer Program 필요. 범위 밖
- **디버깅** — [실기기 앱 디버깅](./local-development.md#실기기-앱-디버깅)

### JS만 바꿨을 때 — EAS Update

설치된 APK에 JS 번들만 보냄. `apps/mobile`에서

```bash
npx eas-cli@latest update --channel preview --environment preview --message "<변경 내용>"
```

- **반영 시점** — 앱이 켜질 때 받아 두고 다음 실행부터 적용
- **`--environment preview`** — EAS의 `EXPO_PUBLIC_*`를 번들에 넣음. 빠뜨리면 API 주소 등이 비어 앱이 동작하지 않음
- **채널** — `eas.json`의 빌드 프로필 `channel`. preview APK는 `preview` 채널만 받음
- **runtimeVersion** — `app.json`의 `version`(정책 `appVersion`). 같은 값끼리만 업데이트가 적용됨
- **네이티브가 바뀌면 다시 빌드** — 패키지 추가 · `app.json` 네이티브 설정 · Expo SDK 변경은 업데이트로 못 보냄. `version`을 올리고 APK를 새로 빌드

## 아직 없는 것

- **커스텀 도메인** — 붙이면 `AUTH_PUBLIC_BASE_URL` · `AUTH_WEB_ORIGIN` · `WEB_ORIGIN` · 약관 URL · OAuth 리디렉션 URI를 함께 변경
- **회원 탈퇴 기능** — 이메일 요청을 받아 DB에서 사용자 행 삭제(관련 행은 `ON DELETE CASCADE`)
