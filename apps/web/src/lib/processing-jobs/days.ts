import { formatKoreanDay, type RecentJob } from '@snapdone/processing';

const DAY_MS = 24 * 60 * 60 * 1000;

export type DayGroup = { label: string; jobs: RecentJob[] };

/**
 * 처리 기록을 한국 날짜로 묶는다. 서버가 준 순서(최근 것부터)를 그대로 지킨다.
 * 오늘 · 어제는 그 말로, 그 전은 `2026. 10. 6.`으로 부른다. `now`는 요청 시각이다.
 */
export const groupByDay = (jobs: readonly RecentJob[], now: Date): DayGroup[] => {
  const today = formatKoreanDay(now.toISOString());
  const yesterday = formatKoreanDay(new Date(now.getTime() - DAY_MS).toISOString());
  const groups: DayGroup[] = [];
  for (const job of jobs) {
    const day = formatKoreanDay(job.createdAt);
    const label = day === today ? '오늘' : day === yesterday ? '어제' : day;
    const last = groups.at(-1);
    if (last?.label === label) last.jobs.push(job);
    else groups.push({ label, jobs: [job] });
  }
  return groups;
};
