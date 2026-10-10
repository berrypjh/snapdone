import type { Breadcrumb, ErrorEvent } from '@sentry/nextjs';

/** query · hash를 뗀 URL. 인증 콜백 · handoff URL의 일회용 code가 Sentry로 가지 않게 한다. */
export function stripQuery(url: string): string {
  return url.split(/[?#]/, 1)[0];
}

/** 요청은 method와 query 없는 URL만 남긴다. 헤더 · 쿠키 · 본문은 보내지 않는다. */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    const { method, url } = event.request;
    event.request = { method, url: url && stripQuery(url) };
  }
  return event;
}

/** console 기록은 버리고, 이동 · 요청 기록의 URL에서 query를 뗀다. */
export function scrubBreadcrumb(crumb: Breadcrumb): Breadcrumb | null {
  if (crumb.category === 'console') return null;
  const data = crumb.data;
  if (data) {
    for (const key of ['url', 'from', 'to']) {
      if (typeof data[key] === 'string') data[key] = stripQuery(data[key]);
    }
  }
  return crumb;
}
