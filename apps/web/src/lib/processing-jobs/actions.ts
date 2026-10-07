'use server';

import { ProcessingApiError } from '@snapdone/onboarding';
import { IMAGE_TYPES, type ImageType, type JobDetail } from '@snapdone/processing';

import { fromAllowedOrigin, readCredential } from '../auth/session';

import { fetchJob, reprocessJob, resolveReceiptField, startJob } from './api';

/**
 * 처리 작업 Action의 결과. 오류는 던지지 않고 값으로 돌려준다 — production에서 Action 오류 내용은 가려진다.
 * `network`는 Go에 닿지 못했거나 응답을 읽지 못한 것이다.
 */
export type DetailResponse =
  { type: 'job'; job: JobDetail } | { type: 'signed-out' } | { type: 'error'; code: string };

const respond = async (call: (credential: string) => Promise<JobDetail | null>) => {
  if (!(await fromAllowedOrigin())) throw new Error('허용되지 않은 origin의 처리 요청입니다.');
  const credential = await readCredential();
  if (!credential) return { type: 'signed-out' } as const;
  try {
    const job = await call(credential);
    return job ? ({ type: 'job', job } as const) : ({ type: 'signed-out' } as const);
  } catch (error) {
    const code = error instanceof ProcessingApiError ? error.code : 'network';
    return { type: 'error', code } as const;
  }
};

const isImageType = (value: unknown): value is ImageType =>
  IMAGE_TYPES.some((type) => type === value);

/** 사진 한 장의 처리를 시작한다. 폼 필드는 `image` 하나다. */
export async function startPhotoJob(form: FormData): Promise<DetailResponse> {
  const image = form.get('image');
  if (!(image instanceof Blob)) return { type: 'error', code: 'invalid_image' };
  return respond((credential) => startJob(credential, image));
}

/** 작업 하나를 다시 읽는다. 처리 중인 작업이 끝났는지 볼 때 쓴다. */
export async function findJob(jobId: string): Promise<DetailResponse> {
  return respond((credential) => fetchJob(credential, jobId));
}

/**
 * 유형을 정하지 못한 작업을 사용자가 고른 유형으로 이어서 처리한다. 폼 필드는 `image` · `sourceJobId` · `imageType`이다.
 * 사진은 이 처리 흐름이 들고 있는 원본이고, 서버는 원래 작업과 같은 사진인지 확인한다.
 */
export async function chooseImageType(form: FormData): Promise<DetailResponse> {
  const image = form.get('image');
  const sourceJobId = form.get('sourceJobId');
  const imageType = form.get('imageType');
  if (!(image instanceof Blob) || typeof sourceJobId !== 'string' || !isImageType(imageType)) {
    return { type: 'error', code: 'invalid_reprocess' };
  }
  return respond((credential) => reprocessJob(credential, { image, sourceJobId, imageType }));
}

/**
 * 처리를 마친 작업의 같은 사진을 다른 처리 방식으로 다시 처리한다. 폼 필드는 `image` · `sourceJobId` · `action`이다.
 * 처리 방식이 그 유형에 있는지는 서버가 확인한다. 저장된 처리 방식은 바꾸지 않는다 — 기본값 저장은 따로 한다.
 */
export async function reprocessWithAction(form: FormData): Promise<DetailResponse> {
  const image = form.get('image');
  const sourceJobId = form.get('sourceJobId');
  const action = form.get('action');
  if (
    !(image instanceof Blob) ||
    typeof sourceJobId !== 'string' ||
    typeof action !== 'string' ||
    !action
  ) {
    return { type: 'error', code: 'invalid_reprocess' };
  }
  return respond((credential) => reprocessJob(credential, { image, sourceJobId, action }));
}

/** 영수증 필드 하나를 확정한다. 서버가 돌려준 작업으로 화면을 바꾼다. */
export async function confirmReceiptField(
  jobId: string,
  field: string,
  value: string,
): Promise<DetailResponse> {
  return respond((credential) => resolveReceiptField(credential, { jobId, field, value }));
}
