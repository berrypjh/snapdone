import { RECEIPT_ACTIONS, type ResultScreen, TEXT_ACTIONS } from '@snapdone/processing';
import { describe, expect, it } from 'vitest';

import {
  appliedLabel,
  confirmFailed,
  remember,
  reprocessFailed,
  resultTitle,
  saved,
} from './resultCopy';

const processed = (applied: Extract<ResultScreen, { kind: 'processed' }>['applied']) =>
  ({ kind: 'processed', applied, texts: [], translationSkipped: false, expense: null }) as const;

describe('resultTitle', () => {
  it('names the finished work of every action', () => {
    const titles = [
      ...TEXT_ACTIONS.map((appliedAction) =>
        resultTitle(processed({ imageType: 'text', appliedAction })),
      ),
      ...RECEIPT_ACTIONS.map((appliedAction) =>
        resultTitle(processed({ imageType: 'receipt', appliedAction })),
      ),
    ];
    expect(titles).toEqual([
      '텍스트를 추출하고 번역했습니다',
      '텍스트를 추출했습니다',
      '내용을 요약했습니다',
      '텍스트를 추출하고 요약했습니다',
      '지출 정보를 정리했습니다',
      '영수증의 텍스트를 추출했습니다',
      '영수증 내용을 요약했습니다',
    ]);
  });

  it('says only the extraction when the translation was not needed', () => {
    const screen = {
      ...processed({ imageType: 'text', appliedAction: 'extract_and_translate' }),
      translationSkipped: true,
    };
    expect(resultTitle(screen)).toBe('텍스트를 추출했습니다');
  });

  it('does not call an unsupported or ambiguous photo processed', () => {
    expect(resultTitle({ kind: 'unsupported' })).toBe('처리할 수 없는 사진입니다');
    expect(resultTitle({ kind: 'ambiguous', candidates: ['text', 'receipt'] })).toBe(
      '어떤 사진인지 골라 주세요',
    );
  });
});

describe('appliedLabel', () => {
  it('names the image type and the action the server applied', () => {
    expect(
      appliedLabel(processed({ imageType: 'text', appliedAction: 'extract_and_translate' })),
    ).toBe('텍스트 / 외국어 · 추출 및 번역');
    expect(appliedLabel(processed({ imageType: 'receipt', appliedAction: 'record_expense' }))).toBe(
      '영수증 · 지출 정보로 정리',
    );
  });
});

describe('confirmFailed', () => {
  it('turns a server code into a sentence and never shows the code', () => {
    expect(confirmFailed('invalid_receipt_field')).toBe(
      '형식이 맞지 않습니다. 안내한 형식으로 다시 입력해 주세요.',
    );
    expect(confirmFailed('provider_unavailable')).not.toContain('provider_unavailable');
  });
});

describe('reprocess copy', () => {
  it('names the image type the default would change for', () => {
    expect(remember('text')).toBe('앞으로 텍스트 / 외국어 사진도 이 방식으로 처리');
    expect(remember('receipt')).toBe('앞으로 영수증 사진도 이 방식으로 처리');
    expect(saved('receipt', '요약')).toBe('앞으로 영수증 사진은 이 방식(요약)으로 처리합니다.');
  });

  it('keeps the previous result in every reprocess failure message', () => {
    for (const reason of ['network', 'not-processed', 'failed', 'unsupported']) {
      expect(reprocessFailed(reason)).toContain('이전 결과는 그대로입니다.');
    }
  });
});
