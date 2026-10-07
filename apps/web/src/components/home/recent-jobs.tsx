import Link from 'next/link';

import { formatKoreanDateTime, type RecentJob, summarizeJob } from '@snapdone/processing';
import { jobDetailPath } from '@snapdone/webview-bridge';

import { NEEDS_CHECK } from './home-copy';

/**
 * 최근 처리 하나. 서버가 준 상태 · 시각 · 적용한 처리 방식 · 결과 앞부분만 보인다.
 * 사진은 저장하지 않으므로 미리보기가 없다. 제목은 그 처리 결과 화면으로 가는 링크다.
 */
function RecentJobItem({ job }: { job: RecentJob }) {
  const { headline, status, preview, facts, needsCheck } = summarizeJob(job);
  const title = `${headline ? `${headline} · ` : ''}${status}`;
  const href = jobDetailPath(job.jobId);
  return (
    <li className="flex min-w-0 flex-col gap-1 border-t border-stroke-light pt-3 first:border-t-0 first:pt-0">
      {href ? (
        <Link
          href={href}
          className="inline-flex min-h-11 items-center self-start typo-body-medium-strong text-text-link underline"
        >
          {title}
        </Link>
      ) : (
        <p className="typo-body-medium-strong">{title}</p>
      )}
      <time dateTime={job.createdAt} className="typo-caption-default text-text-light">
        {formatKoreanDateTime(job.createdAt)}
      </time>
      {needsCheck && <p className="typo-caption-default text-text-error">{NEEDS_CHECK}</p>}
      {preview && <p className="line-clamp-2 typo-paragraph-default break-words">{preview}</p>}
      {facts.length > 0 && (
        <dl className="mt-1 flex flex-col gap-1">
          {facts.map((fact, index) => (
            <div key={index} className="flex min-w-0 flex-col">
              <dt className="typo-caption-default text-text-light">{fact.label}</dt>
              <dd className="typo-paragraph-default break-words">{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  );
}

export function RecentJobs({ jobs }: { jobs: readonly RecentJob[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {jobs.map((job) => (
        <RecentJobItem key={job.jobId} job={job} />
      ))}
    </ul>
  );
}
