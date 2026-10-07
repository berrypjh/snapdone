'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

import { Box, Button } from '@berrypjh/react-ui';
import { POLL_INTERVAL_MS } from '@snapdone/onboarding';
import {
  IMAGE_TYPE_LABEL,
  type JobDetail,
  RECEIPT_ACTION_LABEL,
  TEXT_ACTION_LABEL,
} from '@snapdone/processing';
import { needsReview, presentJob, type ResultScreen } from '@snapdone/processing';

import { loginPage } from '@/lib/auth/redirect';
import { findJob } from '@/lib/processing-jobs/actions';

import { SelectedImage } from '../onboarding/selected-image';

import { ExpenseFields } from './expense-fields';
import {
  AMBIGUOUS_NOTE,
  AMBIGUOUS_TITLE,
  AMBIGUOUS_WITHOUT_PHOTO,
  APPLIED_PREFIX,
  confirmed,
  EXPENSE_TITLE,
  FACTS_TITLE,
  FAILED_NOTE,
  FAILED_TITLE,
  FIELD_LABEL,
  LOAD_FAILED,
  LOGIN_AGAIN,
  NO_PHOTO,
  RECEIPT_DONE,
  REFRESH,
  REVIEW_NOTE,
  RUNNING_NOTE,
  RUNNING_TITLE,
  SIGNED_OUT,
  TEXT_DONE,
  TEXT_TITLE,
  TRANSLATION_SKIPPED,
  TRANSLATION_SKIPPED_TITLE,
  UNSUPPORTED_NOTE,
  UNSUPPORTED_TITLE,
  WITHOUT_OUTCOME_NOTE,
  WITHOUT_OUTCOME_TITLE,
} from './result-copy';
import { TypeChoice } from './type-choice';

/** 결과 화면이 쓰는 원본. 이 처리 흐름이 고른 `File`과 그 blob 주소이고, 주소는 흐름이 만들고 해제한다. */
export type SessionImage = { url: string; file: File };

type ProcessingResultProps = {
  /** 서버가 돌려준 작업. 이후 변화(필드 확정 · 유형 선택 · 처리 끝남)도 서버가 돌려준 작업으로만 바뀐다. */
  initial: JobDetail;
  /** 이 흐름이 들고 있는 원본. 없으면(기록 · 앱 WebView) 사진을 보이지 않고 유형도 고르지 않는다. */
  image: SessionImage | null;
  /** 로그인 뒤 돌아올 경로. */
  returnTo: string;
  /** 처리 화면이 사라진 자리에 열릴 때 제목으로 포커스를 옮긴다. 주소로 연 page는 옮기지 않는다. */
  focusOnOpen?: boolean;
};

const title = (screen: ResultScreen): string => {
  switch (screen.kind) {
    case 'running':
      return RUNNING_TITLE;
    case 'failed':
      return FAILED_TITLE;
    case 'unsupported':
      return UNSUPPORTED_TITLE;
    case 'ambiguous':
      return AMBIGUOUS_TITLE;
    case 'without-outcome':
      return WITHOUT_OUTCOME_TITLE;
    case 'processed':
      if (screen.translationSkipped) return TRANSLATION_SKIPPED_TITLE;
      return screen.applied.imageType === 'text'
        ? TEXT_DONE[screen.applied.appliedAction]
        : RECEIPT_DONE[screen.applied.appliedAction];
  }
};

const appliedLabel = ({ applied }: Extract<ResultScreen, { kind: 'processed' }>) => {
  const action =
    applied.imageType === 'text'
      ? TEXT_ACTION_LABEL[applied.appliedAction]
      : RECEIPT_ACTION_LABEL[applied.appliedAction];
  return `${IMAGE_TYPE_LABEL[applied.imageType]} · ${action}`;
};

/** 처리 중인 작업은 끝날 때까지 서버에 다시 묻는다. 서버가 오래 끝나지 못한 작업은 실패로 돌려준다. */
const usePolling = (
  job: JobDetail,
  onJob: (job: JobDetail) => void,
  onSignedOut: () => void,
  onFailed: () => void,
) => {
  const [attempt, setAttempt] = useState(0);
  const callbacks = useRef({ onJob, onSignedOut, onFailed });
  useEffect(() => {
    callbacks.current = { onJob, onSignedOut, onFailed };
  });

  useEffect(() => {
    if (job.status !== 'running') return;
    let stopped = false;
    const timer = setTimeout(async () => {
      const response = await findJob(job.jobId).catch(() => ({ type: 'error' }) as const);
      if (stopped) return;
      if (response.type === 'job') callbacks.current.onJob(response.job);
      else if (response.type === 'signed-out') callbacks.current.onSignedOut();
      else callbacks.current.onFailed();
    }, POLL_INTERVAL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [job, attempt]);

  return () => setAttempt((count) => count + 1);
};

/**
 * 사진 처리 결과. 서버가 돌려준 유형 · 적용한 처리 방식 · 결과만 보이고, 서버가 주지 않은 값은 만들지 않는다.
 * 처리를 마친 결과(processed)만 완료로 보인다. 지원하지 않는 사진 · 유형을 정하지 못한 사진은 그렇다고 말한다.
 */
export function ProcessingResult({
  initial,
  image,
  returnTo,
  focusOnOpen = false,
}: ProcessingResultProps) {
  const [job, setJob] = useState(initial);
  const [signedOut, setSignedOut] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const expenseHeading = useRef<HTMLHeadingElement>(null);
  const screen = presentJob(job);

  const retry = usePolling(
    job,
    setJob,
    () => setSignedOut(true),
    () => setLoadFailed(true),
  );

  // 화면 종류가 바뀌면(처리 끝남 · 유형 선택) 눌렀던 버튼이 사라지므로 제목으로 포커스를 옮긴다.
  // 처음 열 때는 옮기지 않는다 — 키보드 사용자는 본문으로 건너뛰기에서 시작한다.
  const shownKind = useRef(focusOnOpen ? null : screen.kind);
  useEffect(() => {
    if (shownKind.current === screen.kind) return;
    shownKind.current = screen.kind;
    heading.current?.focus();
  }, [screen.kind]);

  const update = (next: JobDetail) => {
    setLoadFailed(false);
    setJob(next);
  };

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="text-center">
        <h1 ref={heading} tabIndex={-1} className="typo-heading-h4">
          {title(screen)}
        </h1>
        {screen.kind === 'processed' && (
          <p className="mt-2 typo-caption-default text-text-light">
            <span className="sr-only">{APPLIED_PREFIX}: </span>
            {appliedLabel(screen)}
          </p>
        )}
      </div>

      {image ? (
        <SelectedImage url={image.url} />
      ) : (
        <p className="text-center typo-caption-default text-text-light">{NO_PHOTO}</p>
      )}

      {/* 항상 있는 live region 하나에 문장만 바꿔야 스크린 리더가 놓치지 않는다. */}
      <p role="status" className="sr-only">
        {screen.kind === 'running' ? RUNNING_TITLE : announcement}
      </p>

      {screen.kind === 'running' && !loadFailed && (
        <p className="text-center typo-paragraph-default text-text-light">{RUNNING_NOTE}</p>
      )}
      {screen.kind === 'failed' && (
        <p className="text-center typo-paragraph-default">{FAILED_NOTE}</p>
      )}
      {screen.kind === 'unsupported' && (
        <p className="text-center typo-paragraph-default">{UNSUPPORTED_NOTE}</p>
      )}

      {screen.kind === 'ambiguous' && (
        <div className="flex flex-col gap-4">
          <p className="text-center typo-paragraph-default">{AMBIGUOUS_NOTE}</p>
          {image ? (
            <TypeChoice
              jobId={job.jobId}
              candidates={screen.candidates}
              file={image.file}
              onStarted={update}
              onSignedOut={() => setSignedOut(true)}
            />
          ) : (
            <p className="text-center typo-paragraph-default text-text-light">
              {AMBIGUOUS_WITHOUT_PHOTO}
            </p>
          )}
        </div>
      )}

      {screen.kind === 'without-outcome' && (
        <section aria-labelledby="result-facts" className="flex flex-col gap-3">
          <p className="typo-paragraph-default text-text-light">{WITHOUT_OUTCOME_NOTE}</p>
          {screen.facts.length > 0 && (
            <>
              <h2 id="result-facts" className="typo-body-medium-strong">
                {FACTS_TITLE}
              </h2>
              <Box
                p="lg"
                bg="background.surface"
                radius="lg"
                className="border border-stroke-light"
              >
                <dl className="flex flex-col gap-3">
                  {screen.facts.map((fact, index) => (
                    <div key={index} className="flex min-w-0 flex-col gap-1">
                      <dt className="typo-caption-default text-text-light">{fact.label}</dt>
                      <dd className="typo-paragraph-default break-words">{fact.value}</dd>
                    </div>
                  ))}
                </dl>
              </Box>
            </>
          )}
        </section>
      )}

      {screen.kind === 'processed' && (
        <>
          {screen.texts.map((block) => (
            <section
              key={block.kind}
              aria-labelledby={`result-${block.kind}`}
              className="flex min-w-0 flex-col gap-3"
            >
              <h2 id={`result-${block.kind}`} className="typo-body-medium-strong">
                {TEXT_TITLE[block.kind]}
              </h2>
              <Box
                p="lg"
                bg="background.surface"
                radius="lg"
                className="border border-stroke-light"
              >
                <p className="typo-paragraph-default break-words whitespace-pre-wrap">
                  {block.text}
                </p>
              </Box>
            </section>
          ))}
          {screen.translationSkipped && (
            <p className="typo-paragraph-default text-text-light">{TRANSLATION_SKIPPED}</p>
          )}
          {screen.expense && (
            <section aria-labelledby="result-expense" className="flex min-w-0 flex-col gap-3">
              <h2
                ref={expenseHeading}
                id="result-expense"
                tabIndex={-1}
                className="typo-body-medium-strong"
              >
                {EXPENSE_TITLE}
              </h2>
              {needsReview(screen) && (
                <p className="typo-paragraph-default text-text-light">{REVIEW_NOTE}</p>
              )}
              <ExpenseFields
                jobId={job.jobId}
                fields={screen.expense}
                onConfirmed={(next, field) => {
                  update(next);
                  setAnnouncement(confirmed(FIELD_LABEL[field.name]));
                  // 확인한 필드의 입력이 사라지므로 지출 정보의 시작으로 포커스를 옮긴다.
                  expenseHeading.current?.focus();
                }}
                onSignedOut={() => setSignedOut(true)}
              />
            </section>
          )}
        </>
      )}

      {loadFailed && (
        <div className="flex flex-col gap-2">
          <p role="alert" className="text-center typo-paragraph-default text-text-error">
            {LOAD_FAILED}
          </p>
          <Button
            type="button"
            variant="outlined"
            fullWidth
            className="min-h-11"
            onClick={() => {
              setLoadFailed(false);
              retry();
            }}
          >
            {REFRESH}
          </Button>
        </div>
      )}
      {signedOut && (
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
    </div>
  );
}
