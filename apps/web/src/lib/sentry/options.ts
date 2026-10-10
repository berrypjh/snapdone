import { scrubBreadcrumb, scrubEvent } from './scrub';

/**
 * 브라우저 · 서버가 함께 쓰는 Sentry 설정. DSN이 없으면(로컬 · e2e) 보내지 않는다.
 * DSN과 release는 배포 이미지 빌드 때 들어간다(deploy.sh).
 */
export const sentryOptions = {
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  release: process.env.NEXT_PUBLIC_APP_RELEASE,
  environment: process.env.NODE_ENV,
  sendDefaultPii: false,
  beforeSend: scrubEvent,
  beforeBreadcrumb: scrubBreadcrumb,
};
