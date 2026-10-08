'use client';

import { type FormEvent, startTransition, useActionState, useState } from 'react';
import Link from 'next/link';

import { Box, Button, Radio, RadioGroup } from '@berrypjh/react-ui';
import type { ProcessingPreferences } from '@snapdone/processing';

import { loginPage } from '@/lib/auth/redirect';
import { saveProcessingPreference } from '@/lib/processing-preferences/actions';
import {
  confirmedValue,
  type ImageType,
  saveStatus,
} from '@/lib/processing-preferences/save-status';

import {
  CURRENT,
  LOGIN_AGAIN,
  type OptionCopy,
  PATH,
  RECOMMENDED,
  SAVE,
  STATUS_MESSAGE,
} from './processing-preference-copy';

type ProcessingPreferenceFormProps<T extends ImageType> = {
  imageType: T;
  legend: string;
  options: Record<ProcessingPreferences[T], OptionCopy>;
  /** page가 서버에서 읽어 온 값. */
  initial: ProcessingPreferences[T];
};

/**
 * 이미지 유형 하나의 처리 방식. 이 유형만 저장해 다른 유형의 값을 덮어쓰지 않는다.
 * "현재 설정"은 서버가 확인해 준 값이고, 고르기만 한 값은 저장 전까지 바뀌지 않는다.
 */
export function ProcessingPreferenceForm<T extends ImageType>({
  imageType,
  legend,
  options,
  initial,
}: ProcessingPreferenceFormProps<T>) {
  const [result, action, pending] = useActionState(saveProcessingPreference, null);
  const confirmed = confirmedValue(imageType, initial, result);
  const [selected, setSelected] = useState<string>(initial);
  const status = saveStatus(selected, confirmed, result);
  const entries = Object.entries(options) as [ProcessingPreferences[T], OptionCopy][];

  // `<form action={함수}>`는 성공한 뒤 React가 폼을 reset해, 라디오가 처음 받은 값으로 돌아간다.
  // 고른 값은 state가 가지므로 제출만 직접 넘겨 reset을 피한다.
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(() => action(form));
  };

  return (
    <form onSubmit={submit} aria-label={legend}>
      <Box
        p="xl"
        bg="background.surface"
        radius="lg"
        className="flex flex-col gap-4 border-semanticBorder-divider border-stroke-light shadow-xs"
      >
        <input type="hidden" name="imageType" value={imageType} />
        <RadioGroup
          name="action"
          label={legend}
          value={selected}
          onValueChange={setSelected}
          disabled={pending}
          className="flex flex-col gap-2"
        >
          {entries.map(([value, option]) => (
            <Radio key={value} value={value} className="min-h-11 items-start">
              <span className="flex flex-col gap-1">
                <span className="typo-body-medium-strong">
                  {option.label}
                  {option.recommended && (
                    <span className="ml-2 typo-caption-default text-text-light">{RECOMMENDED}</span>
                  )}
                </span>
                <span className="typo-caption-default text-text-light">{option.description}</span>
              </span>
            </Radio>
          ))}
        </RadioGroup>

        <p className="typo-caption-default text-text-light">
          {CURRENT}: {options[confirmed].label}
        </p>

        <Button
          type="submit"
          variant="contained"
          size="lg"
          fullWidth
          disabled={status !== 'unsaved' && status !== 'error'}
          loading={pending}
        >
          {SAVE}
        </Button>

        <p role="status" className="typo-caption-default empty:sr-only">
          {status === 'saved' ? STATUS_MESSAGE.saved : ''}
        </p>
        {(status === 'error' || status === 'signed-out') && (
          <p role="alert" className="typo-caption-default text-text-error">
            {STATUS_MESSAGE[status]}
          </p>
        )}
        {status === 'signed-out' && (
          <Link
            href={loginPage(PATH)}
            className="inline-flex min-h-11 items-center self-start typo-body-medium-strong text-text-link underline"
          >
            {LOGIN_AGAIN}
          </Link>
        )}
      </Box>
    </form>
  );
}
