'use client';

import { type FormEvent, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Button, Checkbox, Radio, RadioGroup } from '@berrypjh/react-ui';
import { runProcessing } from '@snapdone/onboarding';
import {
  actionLabel,
  actionsFor,
  isProcessed,
  type JobDetail,
  preferenceToSave,
  type ProcessingSelection,
} from '@snapdone/processing';

import { loginPage } from '@/lib/auth/redirect';
import { reprocessWithAction } from '@/lib/processing-jobs/actions';
import { createJobPort } from '@/lib/processing-jobs/port';
import { saveProcessingPreference } from '@/lib/processing-preferences/actions';

import {
  ACTION_LEGEND,
  CURRENT,
  currentAction,
  LOGIN_AGAIN,
  remember,
  REMEMBER_HELP,
  REPROCESS,
  REPROCESS_FAILED,
  REPROCESS_FAILED_DEFAULT,
  REPROCESS_TITLE,
  REPROCESSED,
  REPROCESSING,
  RETRY_SAVE,
  SAVE_FAILED,
  saved,
  SAVING,
  SIGNED_OUT,
} from './reprocess-copy';

/** 기본 처리 방식 저장의 상태. 다시 처리한 결과와 따로 간다. */
type PreferenceSave =
  | { status: 'idle' }
  | { status: 'saving'; selection: ProcessingSelection }
  | { status: 'saved'; selection: ProcessingSelection }
  | { status: 'failed'; selection: ProcessingSelection }
  | { status: 'signed-out' };

type ReprocessPanelProps = {
  /** 처리를 마친 지금 결과. `selection`이 서버가 적용한 유형 · 처리 방식이다. */
  job: JobDetail;
  /** 이 흐름이 들고 있는 원본. 같은 사진을 다시 보내 서버가 원래 작업과 같은지 확인한다. */
  file: File;
  /** 다시 처리한 작업이 처리를 마쳤을 때만 부른다. 실패하면 이전 결과를 그대로 둔다. */
  onReprocessed: (job: JobDetail) => void;
  returnTo: string;
};

/**
 * 같은 사진을 다른 처리 방식으로 다시 처리한다. 지금 유형에 있는 처리 방식만 보인다.
 * 다시 처리와 기본 처리 방식 저장은 서로 다른 요청이다 — 다시 처리(`reprocessWithAction`)는 저장된 처리 방식을
 * 바꾸지 않고, 사용자가 "앞으로도"를 골랐고 새 작업이 처리를 마쳤을 때만 기본값 저장(`saveProcessingPreference`)을 따로 보낸다.
 */
export function ReprocessPanel({ job, file, onReprocessed, returnTo }: ReprocessPanelProps) {
  const router = useRouter();
  const applied = job.selection;
  const [selected, setSelected] = useState(applied?.appliedAction ?? '');
  const [rememberIt, setRememberIt] = useState(false);
  const [running, setRunning] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [preference, setPreference] = useState<PreferenceSave>({ status: 'idle' });
  const mounted = useRef(true);
  const run = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // 결과가 바뀌면(다시 처리 성공) 지금 처리 방식에서 다시 고르게 한다. 저장 상태는 그대로 보인다.
  useEffect(() => {
    setSelected(job.selection?.appliedAction ?? '');
    setRememberIt(false);
  }, [job.jobId, job.selection?.appliedAction]);

  if (!applied) return null;
  const changed = selected !== applied.appliedAction;
  const typeActions = actionsFor(applied.imageType);

  const save = async (selection: ProcessingSelection) => {
    setPreference({ status: 'saving', selection });
    const form = new FormData();
    form.append('imageType', selection.imageType);
    form.append('action', selection.appliedAction);
    const response = await saveProcessingPreference(null, form).catch(
      () => ({ type: 'error' }) as const,
    );
    if (!mounted.current) return;
    if (response.type === 'saved') setPreference({ status: 'saved', selection });
    else if (response.type === 'signed-out') setPreference({ status: 'signed-out' });
    else setPreference({ status: 'failed', selection });
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (running || !changed) return;
    const mine = ++run.current;
    const keep = rememberIt;
    setRunning(true);
    setFailed(null);
    setDone(false);
    const port = createJobPort(() => router.replace(loginPage(returnTo)), reprocessWithAction, {
      sourceJobId: job.jobId,
      action: selected,
    });
    // 화면을 떠났거나 더 새로운 시도가 있으면 늦게 온 응답으로 화면을 바꾸지 않는다.
    const stopped = () => !mounted.current || run.current !== mine;
    void runProcessing(
      port,
      file,
      (state) => {
        if (state.status === 'failed') {
          setRunning(false);
          setFailed(state.reason);
        } else if (state.status === 'completed') {
          setRunning(false);
          if (!isProcessed(state.job)) return setFailed('not-processed');
          setDone(true);
          onReprocessed(state.job);
          const selection = preferenceToSave(keep, state.job);
          if (selection) void save(selection);
        }
      },
      stopped,
    );
  };

  const status = running
    ? REPROCESSING
    : preference.status === 'saving'
      ? SAVING
      : preference.status === 'saved'
        ? saved(
            preference.selection.imageType,
            actionLabel(preference.selection.imageType, preference.selection.appliedAction) ?? '',
          )
        : done
          ? REPROCESSED
          : '';

  return (
    <section aria-labelledby="reprocess-title" className="flex min-w-0 flex-col gap-4">
      <h2 id="reprocess-title" className="typo-body-medium-strong">
        {REPROCESS_TITLE}
      </h2>
      <p className="typo-caption-default text-text-light">
        {currentAction(actionLabel(applied.imageType, applied.appliedAction) ?? '')}
      </p>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <RadioGroup
          name="action"
          label={ACTION_LEGEND}
          value={selected}
          onValueChange={setSelected}
          disabled={running}
          className="flex flex-col gap-2"
        >
          {typeActions.map((action) => (
            <Radio key={action} value={action} className="min-h-11 items-start">
              <span className="typo-body-medium-strong">
                {actionLabel(applied.imageType, action)}
                {action === applied.appliedAction && (
                  <span className="ml-2 typo-caption-default text-text-light">({CURRENT})</span>
                )}
              </span>
            </Radio>
          ))}
        </RadioGroup>

        {changed && (
          <div className="flex flex-col gap-1">
            <Checkbox
              name="remember"
              checked={rememberIt}
              onChange={(event) => setRememberIt(event.target.checked)}
              disabled={running}
              className="min-h-11"
            >
              {remember(applied.imageType)}
            </Checkbox>
            <p className="typo-caption-default text-text-light">{REMEMBER_HELP}</p>
          </div>
        )}

        <Button
          type="submit"
          variant="contained"
          size="lg"
          fullWidth
          loading={running}
          disabled={running || !changed}
        >
          {REPROCESS}
        </Button>
      </form>

      <p role="status" className="typo-paragraph-default empty:sr-only">
        {status}
      </p>
      {failed && (
        <p role="alert" className="typo-paragraph-default text-text-error">
          {REPROCESS_FAILED[failed] ?? REPROCESS_FAILED_DEFAULT}
        </p>
      )}
      {preference.status === 'failed' && (
        <div className="flex flex-col gap-2">
          <p role="alert" className="typo-paragraph-default text-text-error">
            {SAVE_FAILED}
          </p>
          <Button
            type="button"
            variant="outlined"
            fullWidth
            className="min-h-11"
            onClick={() => void save(preference.selection)}
          >
            {RETRY_SAVE}
          </Button>
        </div>
      )}
      {preference.status === 'signed-out' && (
        <div className="flex flex-col gap-2">
          <p role="alert" className="typo-paragraph-default text-text-error">
            {SIGNED_OUT}
          </p>
          <Link
            href={loginPage(returnTo)}
            className="inline-flex min-h-11 items-center self-start typo-body-medium-strong text-text-link underline"
          >
            {LOGIN_AGAIN}
          </Link>
        </div>
      )}
    </section>
  );
}
