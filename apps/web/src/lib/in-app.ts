import { headers } from 'next/headers';

import { isInAppUserAgent } from '@snapdone/webview-bridge';

export async function isInAppRequest() {
  return isInAppUserAgent((await headers()).get('user-agent'));
}
