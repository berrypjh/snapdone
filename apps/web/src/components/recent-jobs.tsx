import Link from 'next/link';

import {
  formatKoreanDateTime,
  formatKoreanTime,
  type RecentJob,
  summarizeJob,
} from '@snapdone/processing';
import { jobDetailPath } from '@snapdone/webview-bridge';
import { ChevronRight } from 'lucide-react';

const NEEDS_CHECK = '확인이 필요한 정보가 있습니다';

/**
 * 최근 처리 하나. 제목(적용한 유형 · 처리 방식, 없으면 상태)이 그 처리 결과로 가는 링크이고, 항목 전체를 누를 수 있다.
 * 시각은 제목 줄 오른쪽에, 상태는 마치지 못했을 때만, 결과 앞부분은 한 줄로 보인다. 사진은 저장하지 않으므로 미리보기가 없다.
 */
function RecentJobItem({ job, timeOnly }: { job: RecentJob; timeOnly: boolean }) {
  const { headline, status, preview, facts, needsCheck, done } = summarizeJob(job);
  const href = jobDetailPath(job.jobId);
  const title = headline ?? status;
  return (
    <li className="relative flex min-w-0 flex-col gap-1 border-t border-stroke-light py-4 first:border-t-0 first:pt-0 last:pb-0">
      {/* 누르는 자리는 항목 전체(링크의 after)라 제목 줄은 글 높이만 차지한다. */}
      <div className="flex items-center justify-between gap-3">
        {href ? (
          // 항목 전체가 누르는 자리다. 링크 이름은 제목만이다.
          <Link
            href={href}
            className="min-w-0 typo-body-medium-strong text-text-default underline-offset-4 after:absolute after:inset-0 hover:underline"
          >
            {title}
          </Link>
        ) : (
          <p className="min-w-0 typo-body-medium-strong">{title}</p>
        )}
        <span className="flex shrink-0 items-center gap-1 typo-caption-default text-text-light">
          <time dateTime={job.createdAt}>
            {timeOnly ? formatKoreanTime(job.createdAt) : formatKoreanDateTime(job.createdAt)}
          </time>
          {href && <ChevronRight aria-hidden size={16} />}
        </span>
      </div>
      {headline && !done && <p className="typo-caption-default text-text-error">{status}</p>}
      {needsCheck && <p className="typo-caption-default text-text-error">{NEEDS_CHECK}</p>}
      {preview && (
        <p className="line-clamp-1 typo-paragraph-default break-words text-text-light">{preview}</p>
      )}
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

/** 처리 기록 목록. 날짜로 묶은 목록(기록 화면)은 `timeOnly`로 시각만 보인다. */
export function RecentJobs({
  jobs,
  timeOnly = false,
}: {
  jobs: readonly RecentJob[];
  timeOnly?: boolean;
}) {
  return (
    <ul className="flex flex-col">
      {jobs.map((job) => (
        <RecentJobItem key={job.jobId} job={job} timeOnly={timeOnly} />
      ))}
    </ul>
  );
}
