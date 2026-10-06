import {
  formatKoreanDateTime,
  kindLabel,
  type RecentJob,
  STATUS_LABEL,
} from '@snapdone/processing';

/** 최근 처리 하나. 서버가 준 상태 · 시각 · 찾은 값만 보인다. 사진은 저장하지 않으므로 미리보기가 없다. */
function RecentJobItem({ job }: { job: RecentJob }) {
  const kind = kindLabel(job);
  return (
    <li className="flex min-w-0 flex-col gap-1 border-t border-stroke-light pt-3 first:border-t-0 first:pt-0">
      <p className="typo-body-medium-strong">
        {kind ? `${kind} · ` : ''}
        {STATUS_LABEL[job.status]}
      </p>
      <time dateTime={job.createdAt} className="typo-caption-default text-text-light">
        {formatKoreanDateTime(job.createdAt)}
      </time>
      {job.status === 'completed' && job.result.facts.length > 0 && (
        <dl className="mt-1 flex flex-col gap-1">
          {job.result.facts.map((fact, index) => (
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
