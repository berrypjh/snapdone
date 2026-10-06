import { describe, expect, it } from 'vitest';

import {
  parsePreferences,
  RECEIPT_ACTION_LABEL,
  RECEIPT_ACTIONS,
  TEXT_ACTION_LABEL,
  TEXT_ACTIONS,
} from './preferences';

describe('parsePreferences', () => {
  it('reads the server value as is', () => {
    expect(parsePreferences({ text: 'extract_and_translate', receipt: 'record_expense' })).toEqual({
      text: 'extract_and_translate',
      receipt: 'record_expense',
    });
  });

  it.each(TEXT_ACTIONS)('accepts the text action %s', (text) => {
    expect(parsePreferences({ text, receipt: 'summarize' })).toEqual({
      text,
      receipt: 'summarize',
    });
  });

  it.each(RECEIPT_ACTIONS)('accepts the receipt action %s', (receipt) => {
    expect(parsePreferences({ text: 'summarize', receipt })).toEqual({
      text: 'summarize',
      receipt,
    });
  });

  it.each([
    ['an unknown text action', { text: 'translate', receipt: 'record_expense' }],
    ['a receipt action as text', { text: 'record_expense', receipt: 'record_expense' }],
    ['an unknown receipt action', { text: 'summarize', receipt: 'translate' }],
    ['a text-only action as receipt', { text: 'summarize', receipt: 'extract_and_summarize' }],
    ['a missing text', { receipt: 'record_expense' }],
    ['a missing receipt', { text: 'summarize' }],
    ['an error body', { error: 'provider_unavailable' }],
    ['null', null],
  ])('rejects %s without a default', (_name, value) => {
    expect(parsePreferences(value)).toBeNull();
  });

  it('keeps only the contract fields', () => {
    expect(parsePreferences({ text: 'summarize', receipt: 'summarize', userId: 'user-2' })).toEqual(
      {
        text: 'summarize',
        receipt: 'summarize',
      },
    );
  });
});

describe('action labels', () => {
  it('names every action the server allows', () => {
    expect(TEXT_ACTIONS.map((action) => TEXT_ACTION_LABEL[action])).toEqual([
      '추출 및 번역',
      '텍스트만 추출',
      '요약',
      '추출 및 요약',
    ]);
    expect(RECEIPT_ACTIONS.map((action) => RECEIPT_ACTION_LABEL[action])).toEqual([
      '지출 정보로 정리',
      '텍스트만 추출',
      '요약',
    ]);
  });
});
