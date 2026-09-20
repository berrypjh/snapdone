import { isRecord } from './record';

const CATEGORIES = [
  'place',
  'event',
  'receipt',
  'foreign_text',
  'shopping',
  'work',
  'other',
] as const;
const ACTIONS = ['save_place', 'add_to_calendar', 'record_expense', 'translate', 'none'] as const;
const CONFIDENCE = ['high', 'medium', 'low'] as const;

/** Go가 받는 사진 원본 상한(byte). 넘으면 서버가 `image_too_large`로 거절한다. */
export const MAX_IMAGE_BYTES = 7_500_000;

/** 처리 작업을 다시 조회하기까지의 간격. mobile과 web이 같다. */
export const POLL_INTERVAL_MS = 2000;

/** 사진에서 찾은 것. 신뢰도는 숫자가 아니라 단계다. */
export type ProcessingResult = {
  category: (typeof CATEGORIES)[number];
  facts: { label: string; value: string }[];
  suggestedAction: (typeof ACTIONS)[number];
  confidence: (typeof CONFIDENCE)[number];
};

export type ProcessingJob =
  | { jobId: string; status: 'running' }
  | { jobId: string; status: 'completed'; result: ProcessingResult }
  | { jobId: string; status: 'failed' };

/** 서버 오류 코드 또는 응답을 받지 못한 `network`. */
export class ProcessingApiError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'ProcessingApiError';
  }
}

const oneOf = <T extends string>(values: readonly T[], value: unknown): T | undefined =>
  values.find((known) => known === value);

const parseResult = (value: unknown): ProcessingResult | null => {
  if (!isRecord(value) || !Array.isArray(value.facts)) return null;
  const category = oneOf(CATEGORIES, value.category);
  const suggestedAction = oneOf(ACTIONS, value.suggestedAction);
  const confidence = oneOf(CONFIDENCE, value.confidence);
  const facts = value.facts.filter(
    (fact): fact is { label: string; value: string } =>
      isRecord(fact) && typeof fact.label === 'string' && typeof fact.value === 'string',
  );
  if (!category || !suggestedAction || !confidence || facts.length !== value.facts.length) {
    return null;
  }
  return {
    category,
    facts: facts.map(({ label, value }) => ({ label, value })),
    suggestedAction,
    confidence,
  };
};

/** 응답에서 작업만 꺼낸다. 모양이 틀리면 `null`이다. */
export const parseJob = (value: unknown): ProcessingJob | null => {
  if (!isRecord(value) || typeof value.jobId !== 'string' || value.jobId === '') return null;
  const { jobId } = value;
  if (value.status === 'running' || value.status === 'failed')
    return { jobId, status: value.status };
  if (value.status !== 'completed') return null;
  const result = parseResult(value.result);
  return result ? { jobId, status: 'completed', result } : null;
};

/**
 * 처리 API 응답을 작업으로 바꾼다. 401이면 `null`(로그인이 끝남)이고, 그 밖의 실패는
 * 서버 오류 코드를, 모양이 틀린 응답은 `unknown`을 `ProcessingApiError`로 던진다.
 */
export const readJobResponse = (
  response: { ok: boolean; status: number },
  body: unknown,
): ProcessingJob | null => {
  if (response.status === 401) return null;
  if (!response.ok) {
    throw new ProcessingApiError(
      isRecord(body) && typeof body.error === 'string' ? body.error : 'unknown',
    );
  }
  const job = parseJob(body);
  if (!job) throw new ProcessingApiError('unknown');
  return job;
};

/** 실패 이유. 사용자에게는 이유별로 다른 안내가 간다. */
export type ProcessingFailure = 'unsupported' | 'too-large' | 'network' | 'failed';

/** 화면이 보이는 상태. 서버 작업 상태만 따르고 중간 단계를 지어내지 않는다. */
export type ProcessingState =
  | { status: 'starting' }
  | { status: 'running'; jobId: string }
  | { status: 'completed'; jobId: string; result: ProcessingResult }
  | { status: 'failed'; reason: ProcessingFailure };

/**
 * 처리 시작 · 조회 · 대기. 사진의 모양은 플랫폼이 정한다(mobile 파일 주소, web `File`).
 * start · find가 `null`이면 로그인이 끝난 것이다.
 */
export type ProcessingPort<Image> = {
  start: (image: Image) => Promise<ProcessingJob | null>;
  find: (jobId: string) => Promise<ProcessingJob | null>;
  wait: () => Promise<void>;
};

export const failureOf = (error: unknown): ProcessingFailure => {
  if (!(error instanceof ProcessingApiError)) return 'failed';
  switch (error.code) {
    case 'unsupported_image':
      return 'unsupported';
    case 'image_too_large':
      return 'too-large';
    case 'network':
      return 'network';
    default:
      return 'failed';
  }
};

const settle = async (call: () => Promise<ProcessingJob | null>) => {
  try {
    return { job: await call() };
  } catch (error) {
    return { failure: failureOf(error) };
  }
};

/**
 * 처리를 시작하고 끝(완료 · 실패)날 때까지 조회한다. 조회는 한 번에 하나라 응답 순서가 뒤섞이지 않는다.
 * stopped가 참이 되면(화면을 떠남) 더 알리지도 조회하지도 않는다. 로그인이 끝나도 멈춘다.
 */
export const runProcessing = async <Image>(
  port: ProcessingPort<Image>,
  image: Image,
  onChange: (state: ProcessingState) => void,
  stopped: () => boolean,
) => {
  const report = (state: ProcessingState) => {
    if (!stopped()) onChange(state);
  };

  report({ status: 'starting' });
  let outcome = await settle(() => port.start(image));
  while (outcome.job?.status === 'running') {
    const { jobId } = outcome.job;
    report({ status: 'running', jobId });
    await port.wait();
    if (stopped()) return;
    outcome = await settle(() => port.find(jobId));
  }

  if (outcome.failure) report({ status: 'failed', reason: outcome.failure });
  else if (outcome.job?.status === 'completed') {
    report({ status: 'completed', jobId: outcome.job.jobId, result: outcome.job.result });
  } else if (outcome.job?.status === 'failed') report({ status: 'failed', reason: 'failed' });
};
