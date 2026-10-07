import { Stack } from '@berrypjh/react-ui';
import type { Metadata } from 'next';

import { InAppReady } from '@/components/in-app-ready';
import { PhotoFlow } from '@/components/processing/photo-flow';
import { IN_APP_NOTE, PAGE_TITLE, PATH } from '@/components/processing/photo-flow-copy';
import { requireSession } from '@/lib/auth/session';
import { isInAppRequest } from '@/lib/in-app';

export const metadata: Metadata = {
  title: PAGE_TITLE,
};

/**
 * 브라우저에서 사진 한 장을 올려 처리한다. 앱 WebView에서는 web의 파일 선택을 카메라 대신 쓰지 않는다 —
 * 사진은 앱이 받고, 이 화면은 그렇다고만 말한다.
 */
export default async function ProcessPage() {
  await requireSession(PATH);
  const inApp = await isInAppRequest();

  return (
    <Stack gap="xl">
      {inApp ? (
        <div className="flex flex-col gap-3">
          <h1 className="typo-heading-h4">{PAGE_TITLE}</h1>
          <p className="typo-paragraph-default">{IN_APP_NOTE}</p>
        </div>
      ) : (
        <PhotoFlow />
      )}
      <InAppReady title={PAGE_TITLE} />
    </Stack>
  );
}
