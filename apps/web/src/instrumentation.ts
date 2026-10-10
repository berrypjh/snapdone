import * as Sentry from '@sentry/nextjs';

import { sentryOptions } from '@/lib/sentry/options';

/** 서버(Node) 오류를 Sentry로 보낸다. edge runtime은 쓰지 않는다. */
export function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') Sentry.init(sentryOptions);
}

export const onRequestError = Sentry.captureRequestError;
