import { useEffect, useState } from 'react';

import { MAX_IMAGE_BYTES } from '@snapdone/onboarding';

/** Go가 내용으로 판별해 받는 형식. 파일 선택 창에서 먼저 거른다. */
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
export const PHOTO_ACCEPT = PHOTO_TYPES.join(',');

/** 고른 파일이 올릴 수 있는 사진 한 장인가. 고르지 않았으면(취소) 오류가 아니라 `none`이다. */
export type PhotoCheck =
  | { type: 'photo'; file: File }
  | { type: 'none' }
  | { type: 'invalid'; reason: 'multiple' | 'format' | 'too-large' };

/**
 * 파일 선택 · 끌어 놓기로 받은 파일을 확인한다. 형식은 브라우저가 아는 경우에만 미리 거르고,
 * 모르면(빈 type) 서버가 내용으로 판별하게 둔다. 크기는 서버 상한(`MAX_IMAGE_BYTES`)과 같다.
 */
export const checkPhoto = (files: readonly File[]): PhotoCheck => {
  const [file] = files;
  if (!file) return { type: 'none' };
  if (files.length > 1) return { type: 'invalid', reason: 'multiple' };
  if (file.type && !PHOTO_TYPES.some((type) => type === file.type)) {
    return { type: 'invalid', reason: 'format' };
  }
  if (file.size > MAX_IMAGE_BYTES) return { type: 'invalid', reason: 'too-large' };
  return { type: 'photo', file };
};

/** 고른 파일의 blob 주소. 파일이 바뀌거나 화면을 떠나면 해제한다. */
export const useObjectUrl = (file: File | null) => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) return;
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return file ? url : null;
};
