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

SA=<PROJECT_NUMBER>-compute@developer.gserviceaccount.com
gcloud projects add-iam-policy-binding <PROJECT_ID> --member=serviceAccount:${SA} --role=roles/secretmanager.secretAccessor
gcloud projects add-iam-policy-binding <PROJECT_ID> --member=serviceAccount:${SA} --role=roles/cloudsql.client
```

- **zsh** — `$VAR:a`는 경로 수식어로 해석됨. 변수는 `${VAR}`로 감싸거나 값을 그대로 적음
- **`AUTH_ENCRYPTION_KEY`** — 바꾸면 이미 암호화한 값을 읽지 못함
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
npx eas-cli@latest env:create --environment preview --visibility secret --name GITHUB_TOKEN --value <read:packages 토큰>
```

3. 저장소 루트에서 `pnpm exec nx build mobile --platform=android --profile=preview`
4. 빌드 링크의 APK 설치. Play 프로텍트 · 삼성 자동 차단이 막으면 설치하는 동안만 끔

- **iPhone** — 유료 Apple Developer Program 필요. 범위 밖
- **디버깅** — [실기기 앱 디버깅](./local-development.md#실기기-앱-디버깅)

## 아직 없는 것

- **자동 배포** — GitHub Actions 없음
- **커스텀 도메인** — 붙이면 `AUTH_PUBLIC_BASE_URL` · `AUTH_WEB_ORIGIN` · `WEB_ORIGIN` · 약관 URL · OAuth 리디렉션 URI를 함께 변경
- **회원 탈퇴 기능** — 이메일 요청을 받아 DB에서 사용자 행 삭제(관련 행은 `ON DELETE CASCADE`)
