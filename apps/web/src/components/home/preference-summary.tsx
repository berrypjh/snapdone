import Link from 'next/link';

import {
  IMAGE_TYPE_LABEL,
  type Loaded,
  type ProcessingPreferences,
  RECEIPT_ACTION_LABEL,
  TEXT_ACTION_LABEL,
} from '@snapdone/processing';

import { PATH } from '../settings/processing-preference-copy';

import { PREFERENCES_EDIT, PREFERENCES_FAILED } from './home-copy';

/** 서버에 저장된 처리 방식을 처리 설정 화면과 같은 이름으로 보인다. 읽지 못했으면 기본값을 대신 보이지 않는다. */
export function PreferenceSummary({ preferences }: { preferences: Loaded<ProcessingPreferences> }) {
  return (
    <>
      {preferences.ok ? (
        <dl className="flex flex-col gap-2">
          <div className="flex min-w-0 flex-col">
            <dt className="typo-caption-default text-text-light">{IMAGE_TYPE_LABEL.text}</dt>
            <dd className="typo-paragraph-default">{TEXT_ACTION_LABEL[preferences.value.text]}</dd>
          </div>
          <div className="flex min-w-0 flex-col">
            <dt className="typo-caption-default text-text-light">{IMAGE_TYPE_LABEL.receipt}</dt>
            <dd className="typo-paragraph-default">
              {RECEIPT_ACTION_LABEL[preferences.value.receipt]}
            </dd>
          </div>
        </dl>
      ) : (
        <p role="alert" className="typo-paragraph-default text-text-error">
          {PREFERENCES_FAILED}
        </p>
      )}
      <Link
        href={PATH}
        className="inline-flex min-h-11 items-center self-start typo-body-medium-strong text-text-link underline"
      >
        {PREFERENCES_EDIT}
      </Link>
    </>
  );
}
