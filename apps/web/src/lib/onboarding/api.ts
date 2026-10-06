import {
  type CompletedProgress,
  parseCompletedProgress,
  parseSavedProgress,
  ProcessingApiError,
  type ProcessingJob,
  type ProgressUpdate,
  readJobResponse,
  type SavedProgress,
} from '@snapdone/onboarding';

import { apiFetch, bearer } from '../api';

/** 서버의 진행이 이 저장과 맞지 않는다(409 — 이미 마침 · 순서 어긋남). 다른 기기 · 탭이 먼저 바꿨다. */
export class ProgressConflictError extends Error {
  constructor() {
    super('온보딩 진행이 다른 곳에서 먼저 바뀌었습니다.');
    this.name = 'ProgressConflictError';
  }
}

const progressRequest = async <T extends SavedProgress>(
  path: string,
  credential: string,
  parse: (value: unknown) => T | null,
  init: RequestInit = {},
): Promise<T | null> => {
  const response = await apiFetch(path, {
    ...init,
    headers: { ...init.headers, ...bearer(credential) },
  });
  if (response.status === 401) return null;
  if (response.status === 409) throw new ProgressConflictError();
  if (!response.ok) throw new Error(`온보딩 진행 요청이 ${response.status}로 실패했습니다.`);
  const progress = parse(await response.json());
  if (!progress) throw new Error('온보딩 진행 응답 형식이 예상과 다릅니다.');
  return progress;
};

/** 서버에 저장된 온보딩 진행. 세션이 끝났으면 `null`이다. */
export const fetchProgress = (credential: string): Promise<SavedProgress | null> =>
  progressRequest('/v1/onboarding', credential, parseSavedProgress);

/** 온보딩 진행을 저장한다. mobile과 같은 진행이라 어느 쪽에서든 이어 간다. */
export const saveProgress = (
  credential: string,
  update: ProgressUpdate,
): Promise<SavedProgress | null> =>
  progressRequest('/v1/onboarding', credential, parseSavedProgress, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(update),
  });

/** 온보딩을 끝낸다. 다른 기기 · 탭이 먼저 마쳤어도 성공이다. 세션이 끝났으면 `null`이다. */
export const completeProgress = (credential: string): Promise<CompletedProgress | null> =>
  progressRequest('/v1/onboarding/complete', credential, parseCompletedProgress, {
    method: 'POST',
  });

const jobRequest = async (path: string, init: RequestInit): Promise<ProcessingJob | null> => {
  let response: Response;
  try {
    response = await apiFetch(path, init);
  } catch {
    throw new ProcessingApiError('network');
  }
  return readJobResponse(response, await response.json().catch(() => null));
};

/** 사진 처리를 시작한다. 형식 · 크기는 Go가 내용으로 판별한다. */
export const startProcessingJob = (credential: string, image: Blob) => {
  const form = new FormData();
  form.append('image', image, 'photo');
  return jobRequest('/v1/processing-jobs', {
    method: 'POST',
    headers: bearer(credential),
    body: form,
  });
};

export const fetchProcessingJob = (credential: string, jobId: string) =>
  jobRequest(`/v1/processing-jobs/${encodeURIComponent(jobId)}`, { headers: bearer(credential) });
