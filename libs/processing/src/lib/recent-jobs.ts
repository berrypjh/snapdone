import {
  parseJob,
  ProcessingApiError,
  type ProcessingJob,
  type ProcessingResult,
} from '@snapdone/onboarding';

import {
  parseOutcome,
  parseSelection,
  type ProcessingOutcome,
  type ProcessingSelection,
} from './outcome';
import { IMAGE_TYPE_LABEL } from './preferences';
import { isRecord } from './record';

/**
 * 처리 작업 하나와 그 제품 결과(Go `GET /v1/processing-jobs/{jobId}`). 온보딩 첫 사진도 같은 모양이다.
 * `selection`은 서버가 유형 · 처리 방식을 고른 작업에만 있다 — unsupported · ambiguous · 그 계약 전 작업은 `null`이다.
 * `outcome`은 제품 결과를 남긴 완료 작업에만 있다 — 그 계약 전에 만든 작업은 `null`이다.
 * `sourceJobId`는 원래 작업이 남아 있는 재처리 작업에만 있다.
 */
export type JobDetail = ProcessingJob & {
  selection: ProcessingSelection | null;
  outcome: ProcessingOutcome | null;
  sourceJobId: string | null;
};

/**
 * 온보딩을 마친 뒤 올린 사진의 처리 작업 하나(Go `GET /v1/processing-jobs`).
 * `finishedAt`은 끝난 시각을 아는 작업에만 있다 — 끝나지 못해 실패로 보는 작업에는 없다.
 */
export type RecentJob = JobDetail & { createdAt: string; finishedAt: string | null };

const isTimestamp = (value: unknown): value is string =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value));

/** 없으면 `null`, 있으면 읽은 값, 읽지 못하면 `undefined`다. */
const optional = <T>(value: unknown, parse: (value: unknown) => T | null): T | null | undefined =>
  value === undefined ? null : (parse(value) ?? undefined);

const parseSourceJobId = (value: unknown) =>
  typeof value === 'string' && value !== '' ? value : null;

/** processed 결과는 고른 유형 · 처리 방식과 같고, unsupported · ambiguous는 고른 것이 없다(Go `Completion.Validate`). */
const matches = (selection: ProcessingSelection | null, outcome: ProcessingOutcome) =>
  outcome.kind === 'processed'
    ? selection?.imageType === outcome.imageType &&
      selection.appliedAction === outcome.appliedAction
    : selection === null;

/** 작업 응답을 읽는다. 작업 · 고른 처리 방식 · 결과 중 하나라도 계약 밖이거나 서로 맞지 않으면 `null`이다. */
export const parseJobDetail = (value: unknown): JobDetail | null => {
  const job = parseJob(value);
  if (!job || !isRecord(value)) return null;
  const selection = optional(value.selection, parseSelection);
  const outcome = optional(value.outcome, parseOutcome);
  const sourceJobId = optional(value.sourceJobId, parseSourceJobId);
  if (selection === undefined || outcome === undefined || sourceJobId === undefined) return null;
  if (outcome && (job.status !== 'completed' || !matches(selection, outcome))) return null;
  return { ...job, selection, outcome, sourceJobId };
};

/**
 * 작업 응답을 작업으로 바꾼다. 401이면 `null`(로그인이 끝남)이고, 그 밖의 실패는 서버 오류 코드를,
 * 계약 밖의 응답은 `unknown`을 `ProcessingApiError`로 던진다. web · mobile이 같은 규칙으로 읽는다.
 */
export const readJobDetail = (
  response: { ok: boolean; status: number },
  body: unknown,
): JobDetail | null => {
  if (response.status === 401) return null;
  if (!response.ok) {
    throw new ProcessingApiError(
      isRecord(body) && typeof body.error === 'string' ? body.error : 'unknown',
    );
  }
  const job = parseJobDetail(body);
  if (!job) throw new ProcessingApiError('unknown');
  return job;
};

const parseRecentJob = (value: unknown): RecentJob | null => {
  const job = parseJobDetail(value);
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
