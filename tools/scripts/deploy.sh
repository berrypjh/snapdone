#!/usr/bin/env bash
# Build, push and deploy one app to Cloud Run.
#   tools/scripts/deploy.sh api   # builds, runs migrations, then deploys the API
#   tools/scripts/deploy.sh web   # builds with GITHUB_TOKEN, then deploys the web
# Project and region come from `gcloud config` (project, run/region).
set -euo pipefail

app=${1:?usage: deploy.sh api|web}
cd "$(git rev-parse --show-toplevel)"

PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
REGION=$(gcloud config get-value run/region 2>/dev/null)
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
RELEASE=$(date +%Y%m%d-%H%M%S)-$(git rev-parse --short HEAD)
IMAGE=$REGION-docker.pkg.dev/$PROJECT_ID/snapdone/$app:$RELEASE

render() {
  if grep -q REPLACE_ME "$1"; then
    echo "$1 still has REPLACE_ME values" >&2
    exit 1
  fi
  sed -e "s|\${PROJECT_ID}|$PROJECT_ID|g" -e "s|\${PROJECT_NUMBER}|$PROJECT_NUMBER|g" \
      -e "s|\${REGION}|$REGION|g" -e "s|\${IMAGE}|$IMAGE|g" -e "s|\${RELEASE}|$RELEASE|g" "$1" > "$2"
}

out=$(mktemp -d)
trap 'rm -rf "$out"' EXIT

case $app in
  api)
    render apps/api/service.yaml "$out/service.yaml"
    render apps/api/migrate-job.yaml "$out/job.yaml"
    docker build --platform linux/amd64 -t "$IMAGE" apps/api
    docker push "$IMAGE"
    gcloud run jobs replace "$out/job.yaml" --region="$REGION"
    gcloud run jobs execute api-migrate --region="$REGION" --wait
    ;;
  web)
    render apps/web/service.yaml "$out/service.yaml"
    docker build --platform linux/amd64 -f apps/web/Dockerfile \
      --secret id=github_token,env=GITHUB_TOKEN -t "$IMAGE" .
    docker push "$IMAGE"
    ;;
  *)
    echo "unknown app: $app" >&2
    exit 1
    ;;
esac

gcloud run services replace "$out/service.yaml" --region="$REGION"
