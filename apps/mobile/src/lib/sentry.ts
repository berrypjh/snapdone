import * as Sentry from '@sentry/react-native';

import { scrubBreadcrumb, scrubEvent } from './sentryScrub';

/**
 * JS 오류와 네이티브 크래시를 Sentry로 보낸다. DSN이 없으면(로컬 · Expo Go) 켜지 않는다.
 * 화면이 사진 처리 결과(개인정보)를 보이므로 스크린샷 · 화면 구조 · Replay는 끈다.
 */
export function initSentry() {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    sendDefaultPii: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  });
}
