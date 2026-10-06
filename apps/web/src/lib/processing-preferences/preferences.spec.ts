import { describe, expect, it } from 'vitest';

import { parsePreferences, parseUpdate, RECEIPT_ACTIONS, TEXT_ACTIONS } from './preferences';

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
  ])('rejects %s', (_name, value) => {
    expect(parsePreferences(value)).toBeNull();
  });

  it('keeps only the contract fields', () => {
    expect(parsePreferences({ text: 'summarize', receipt: 'summarize', userId: 'user-2' })).toEqual(
      { text: 'summarize', receipt: 'summarize' },
    );
  });
});

describe('parseUpdate', () => {
  it('reads one image type with an action it allows', () => {
    expect(parseUpdate('text', 'extract_and_summarize')).toEqual({
      imageType: 'text',
      action: 'extract_and_summarize',
    });
    expect(parseUpdate('receipt', 'record_expense')).toEqual({
      imageType: 'receipt',
      action: 'record_expense',
    });
  });

  it.each([
    ['text', 'record_expense'],
    ['receipt', 'extract_and_summarize'],
    ['foreign_text', 'summarize'],
    ['text', null],
    [null, 'summarize'],
  ])('rejects %s + %s', (imageType, action) => {
    expect(parseUpdate(imageType, action)).toBeNull();
  });
});
