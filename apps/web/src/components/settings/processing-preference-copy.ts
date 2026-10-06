import type { ReceiptAction, TextAction } from '@/lib/processing-preferences/preferences';

/** 이 화면의 경로. 로그인 뒤 돌아올 곳이다. */
export const PATH = '/settings/processing';

export const PAGE_TITLE = '사진 종류별 기본 처리';
export const PAGE_DESCRIPTION = '사진을 올렸을 때 기본으로 무엇을 할지 선택하세요.';

export type OptionCopy = { label: string; description: string; recommended?: boolean };

export const TEXT_COPY: { legend: string; options: Record<TextAction, OptionCopy> } = {
  legend: '텍스트 / 외국어',
  options: {
    extract_and_translate: {
      label: '추출 및 번역',
      description:
        '이미지에서 텍스트를 추출하고 외국어가 포함되어 있으면 번역 결과를 함께 제공합니다.',
      recommended: true,
    },
    extract_text: { label: '텍스트만 추출', description: '이미지에서 텍스트만 추출합니다.' },
    summarize: { label: '요약', description: '이미지의 내용을 이해한 뒤 핵심 내용만 요약합니다.' },
    extract_and_summarize: {
      label: '추출 및 요약',
      description: '추출된 원문과 요약을 함께 제공합니다.',
    },
  },
};

export const RECEIPT_COPY: { legend: string; options: Record<ReceiptAction, OptionCopy> } = {
  legend: '영수증',
  options: {
    record_expense: {
      label: '지출 정보로 정리',
      description: '가게, 날짜, 금액, 결제 수단 등 확인 가능한 지출 정보를 정리합니다.',
      recommended: true,
    },
    extract_text: {
      label: '텍스트만 추출',
      description: '영수증에 적힌 텍스트를 그대로 추출합니다.',
    },
    summarize: { label: '요약', description: '영수증의 핵심 내용을 간단하게 정리합니다.' },
  },
};

export const RECOMMENDED = '추천';
export const SAVE = '저장';
export const CURRENT = '현재 설정';
export const LOGIN_AGAIN = '다시 로그인';

export const STATUS_MESSAGE = {
  saved: '저장했습니다.',
  error: '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.',
  'signed-out': '로그인이 끝나 저장하지 못했습니다. 다시 로그인해 주세요.',
} as const;

export const LOAD_FAILED = '설정을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';
