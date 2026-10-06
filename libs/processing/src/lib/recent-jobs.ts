import { parseJob, type ProcessingJob, type ProcessingResult } from '@snapdone/onboarding';

import { IMAGE_TYPE_LABEL } from './preferences';
import { isRecord } from './record';

/**
 * 온보딩을 마친 뒤 올린 사진의 처리 작업 하나(Go `GET /v1/processing-jobs`).
 * `finishedAt`은 끝난 시각을 아는 작업에만 있다 — 끝나지 못해 실패로 보는 작업에는 없다.
 */
export type RecentJob = ProcessingJob & { createdAt: string; finishedAt: string | null };

const isTimestamp = (value: unknown): value is string =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value));

const parseRecentJob = (value: unknown): RecentJob | null => {
  const job = parseJob(value);
  if (!job || !isRecord(value) || !isTimestamp(value.createdAt)) return null;
  if (value.finishedAt !== undefined && !isTimestamp(value.finishedAt)) return null;
  return { ...job, createdAt: value.createdAt, finishedAt: value.finishedAt ?? null };
};

/** 목록 응답을 읽는다. 하나라도 계약 밖이면 목록 전체를 믿지 않고 `null`이다. */
export const parseRecentJobs = (value: unknown): RecentJob[] | null => {
  if (!isRecord(value) || !Array.isArray(value.jobs)) return null;
  const jobs = value.jobs.map(parseRecentJob);
  return jobs.every((job) => job !== null) ? jobs : null;
};

/** 읽은 값, 또는 읽지 못함. 읽지 못한 값을 기본값으로 바꾸지 않는다. */
export type Loaded<T> = { ok: true; value: T } | { ok: false };

/**
 * 최근 처리 기록의 상태. 온보딩 뒤 처리한 사진이 없으면 `empty`, 있으면 `active`다.
 * 기록을 읽지 못했으면 `unknown` — 비어 있다고 추측하지 않는다.
 */
export type RecentState = 'empty' | 'active' | 'unknown';

export const recentState = (recent: Loaded<readonly RecentJob[]>): RecentState => {
  if (!recent.ok) return 'unknown';
  return recent.value.length === 0 ? 'empty' : 'active';
};

export const STATUS_LABEL: Record<RecentJob['status'], string> = {
  running: '처리 중',
  completed: '처리 완료',
  failed: '처리하지 못함',
};

/**
 * 지금 제품이 다루는 사진 종류의 이름. 그 밖의 category(place · event 등)는
 * 지원 기능처럼 보이지 않도록 이름을 붙이지 않는다.
 */
const KIND_LABEL: Partial<Record<ProcessingResult['category'], string>> = {
  foreign_text: IMAGE_TYPE_LABEL.text,
  receipt: IMAGE_TYPE_LABEL.receipt,
};

export const kindLabel = (job: RecentJob): string | null =>
  job.status === 'completed' ? (KIND_LABEL[job.result.category] ?? null) : null;
