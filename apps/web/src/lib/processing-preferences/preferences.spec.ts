import { describe, expect, it } from 'vitest';

import { parseUpdate } from './preferences';

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
