'use client';

import { type FormEvent, useState, useTransition } from 'react';

import { Box, Button, TextField } from '@berrypjh/react-ui';
import type { JobDetail } from '@snapdone/processing';
import type { FieldView } from '@snapdone/processing';

import { confirmReceiptField, type DetailResponse } from '@/lib/processing-jobs/actions';

import {
  CONFIRM_FAILED,
  CONFIRM_FAILED_DEFAULT,
  CONFIRM_HELP,
  CONFIRM_HELP_NO_CANDIDATE,
  confirmLegend,
  FIELD_LABEL,
  INPUT_HINT,
  MANUAL_LABEL,
  MANUAL_SUBMIT,
  UNCERTAIN,
  UNRESOLVED,
} from './result-copy';

type Failure = { type: 'signed-out' } | { type: 'error'; code: string };

/** 확인이 필요한 필드 하나. 후보를 고르거나 직접 입력하면 서버가 확정한 작업을 `onConfirmed`로 넘긴다. */
function FieldConfirm({
  jobId,
  field,
  onConfirmed,
  onSignedOut,
}: {
  jobId: string;
  field: FieldView;
  onConfirmed: (job: JobDetail) => void;
  onSignedOut: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<Failure | null>(null);
  const [manual, setManual] = useState('');
  const label = FIELD_LABEL[field.name];
  const hint = INPUT_HINT[field.name];

  const submit = (value: string) =>
    startTransition(async () => {
      // Action 호출 자체가 실패하면(연결 끊김) 응답을 받지 못한 것이다.
      const response: DetailResponse = await confirmReceiptField(jobId, field.name, value).catch(
        () => ({ type: 'error', code: 'network' }),
      );
      if (response.type === 'job') return onConfirmed(response.job);
      if (response.type === 'signed-out') onSignedOut();
      setFailure(response);
    });

  const onManual = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (manual.trim()) submit(manual.trim());
  };

  return (
    <fieldset className="flex min-w-0 flex-col gap-3" disabled={pending}>
      <legend className="typo-body-medium-strong">{confirmLegend(label)}</legend>
      <p className="typo-caption-default text-text-light">
        {field.candidates.length > 0 ? CONFIRM_HELP : CONFIRM_HELP_NO_CANDIDATE}
      </p>
      {field.candidates.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {field.candidates.map((candidate) => (
            <Button
              key={candidate.value}
              type="button"
              variant="outlined"
              className="min-h-11 max-w-full break-words"
              onClick={() => submit(candidate.value)}
            >
              {candidate.label}
            </Button>
          ))}
        </div>
      )}
      <form className="flex flex-col gap-2" onSubmit={onManual}>
        <TextField
          label={MANUAL_LABEL}
          name="value"
          value={manual}
          onChange={(event) => setManual(event.target.value)}
          helperText={hint ?? undefined}
          error={failure?.type === 'error' && failure.code === 'invalid_receipt_field'}
          fullWidth
          required
        />
        <Button type="submit" variant="contained" size="lg" fullWidth loading={pending}>
          {MANUAL_SUBMIT}
        </Button>
      </form>
      {failure?.type === 'error' && (
        <p role="alert" className="typo-caption-default text-text-error">
          {CONFIRM_FAILED[failure.code] ?? CONFIRM_FAILED_DEFAULT}
        </p>
      )}
    </fieldset>
  );
}

type ExpenseFieldsProps = {
  jobId: string;
  fields: readonly FieldView[];
  onConfirmed: (job: JobDetail, field: FieldView) => void;
  onSignedOut: () => void;
};

/**
 * 지출 정보. 서버가 준 값만 보이고, 확정하지 않은 값은 확정한 것처럼 보이지 않는다.
 * 확인이 필요한 필드마다 그 필드만 확정하는 입력이 붙는다.
 */
export function ExpenseFields({ jobId, fields, onConfirmed, onSignedOut }: ExpenseFieldsProps) {
  return (
    <div className="flex flex-col gap-4">
      <Box p="lg" bg="background.surface" radius="lg" className="border border-stroke-light">
        <dl className="flex flex-col gap-3">
          {fields.map((field) => (
            <div key={field.name} className="flex min-w-0 flex-col gap-1">
              <dt className="typo-caption-default text-text-light">{FIELD_LABEL[field.name]}</dt>
              <dd className="typo-paragraph-default break-words">
                {field.value ?? <span className="text-text-light">{UNRESOLVED}</span>}
                {field.state === 'uncertain' && (
                  <span className="ml-2 typo-caption-default text-text-error">({UNCERTAIN})</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </Box>
      {fields
        .filter((field) => field.state !== 'resolved')
        .map((field) => (
          <FieldConfirm
            key={field.name}
            jobId={jobId}
            field={field}
            onConfirmed={(job) => onConfirmed(job, field)}
            onSignedOut={onSignedOut}
          />
        ))}
    </div>
  );
}
