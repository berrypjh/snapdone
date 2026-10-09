import { redirect } from 'next/navigation';

import { Stack } from '@berrypjh/react-ui';
import type { ProcessingPreferences } from '@snapdone/processing';
import type { Metadata } from 'next';

import { InAppReady } from '@/components/in-app-ready';
import {
  LOAD_FAILED,
  PAGE_DESCRIPTION,
  PAGE_TITLE,
  PATH,
  RECEIPT_COPY,
  TEXT_COPY,
} from '@/components/settings/processing-preference-copy';
import { ProcessingPreferenceForm } from '@/components/settings/processing-preference-form';
import { loginPage } from '@/lib/auth/redirect';
import { readCredential, requireSession } from '@/lib/auth/session';
import { fetchPreferences } from '@/lib/processing-preferences/api';

export const metadata: Metadata = {
  title: PAGE_TITLE,
};

/** 서버의 처리 방식. 세션이 끝났으면 로그인으로, 읽지 못했으면 `null`이다. */
const loadPreferences = async (): Promise<ProcessingPreferences | null> => {
  const credential = await readCredential();
  let preferences: ProcessingPreferences | null;
  try {
    preferences = credential ? await fetchPreferences(credential) : null;
  } catch {
    return null;
  }
  if (!preferences) redirect(loginPage(PATH));
  return preferences;
};

export default async function ProcessingPreferencesPage() {
  await requireSession(PATH);
  const preferences = await loadPreferences();

  return (
    <Stack gap="xl">
      <div>
        <h1 className="typo-heading-h4 in-app:sr-only">{PAGE_TITLE}</h1>
        <p className="mt-3 typo-paragraph-default text-text-light in-app:mt-0">
          {PAGE_DESCRIPTION}
        </p>
      </div>

      {preferences ? (
        <>
          <ProcessingPreferenceForm
            imageType="text"
            legend={TEXT_COPY.legend}
            options={TEXT_COPY.options}
            initial={preferences.text}
          />
          <ProcessingPreferenceForm
            imageType="receipt"
            legend={RECEIPT_COPY.legend}
            options={RECEIPT_COPY.options}
            initial={preferences.receipt}
          />
        </>
      ) : (
        <p role="alert" className="typo-paragraph-default">
          {LOAD_FAILED}
        </p>
      )}

      <InAppReady title={PAGE_TITLE} />
    </Stack>
  );
}
