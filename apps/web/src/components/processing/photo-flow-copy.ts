import type { PhotoCheck } from '@/lib/photo';

export const PAGE_TITLE = '사진 처리';
export const PATH = '/process';

export const CHOOSE_TITLE = '처리할 사진을 골라 주세요';
export const CHOOSE_NOTE = '글자나 영수증이 있는 사진 한 장을 올려 주세요.';
export const CHOOSE = '사진 선택';
export const DROP_HINT = '사진을 이곳에 끌어다 놓아도 됩니다.';
export const FORMAT_NOTE = 'JPEG · PNG · GIF · WebP, 7.5MB까지';

export const PREVIEW_TITLE = '사진을 처리할까요?';
export const PREVIEW_NOTE = '사진 속 내용을 확인하고 설정한 방식에 맞게 처리해드려요.';
export const PROCESS = '처리하기';
export const CHOOSE_ANOTHER = '다른 사진 선택';
export const PROCESS_ANOTHER = '다른 사진 처리';
export const GO_HOME = '홈으로';
export const GO_HISTORY = '처리 기록 보기';

export const INVALID_PHOTO: Record<Extract<PhotoCheck, { type: 'invalid' }>['reason'], string> = {
  multiple: '사진은 한 장만 올릴 수 있습니다. 한 장을 골라 주세요.',
  format: 'JPEG · PNG · GIF · WebP 사진만 올릴 수 있습니다.',
  'too-large': '7.5MB보다 큰 사진은 올릴 수 없습니다. 다른 사진을 골라 주세요.',
};

export const IN_APP_NOTE = '앱에서는 홈의 사진 추가하기로 사진을 올려 주세요.';
