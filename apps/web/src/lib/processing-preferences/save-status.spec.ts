import { describe, expect, it } from 'vitest';

import { confirmedValue, saveStatus } from './save-status';

const saved = {
  type: 'saved',
  preferences: { text: 'summarize', receipt: 'extract_text' },
} as const;

describe('confirmedValue', () => {
  it('keeps the value the page read until a save succeeds', () => {
    expect(confirmedValue('text', 'extract_and_translate', null)).toBe('extract_and_translate');
    expect(confirmedValue('text', 'extract_and_translate', { type: 'error' })).toBe(
      'extract_and_translate',
    );
    expect(confirmedValue('text', 'extract_and_translate', { type: 'signed-out' })).toBe(
      'extract_and_translate',
    );
  });

  it('follows what the server saved for this image type only', () => {
    expect(confirmedValue('text', 'extract_and_translate', saved)).toBe('summarize');
    expect(confirmedValue('receipt', 'record_expense', saved)).toBe('extract_text');
  });
});

describe('saveStatus', () => {
  it('is idle when nothing changed and nothing was saved', () => {
    expect(saveStatus('summarize', 'summarize', null)).toBe('idle');
  });

  it('is unsaved when only the selection changed', () => {
    expect(saveStatus('extract_text', 'summarize', null)).toBe('unsaved');
  });

  it('is saved only while the selection still matches what the server saved', () => {
    expect(saveStatus('summarize', 'summarize', saved)).toBe('saved');
    expect(saveStatus('extract_text', 'summarize', saved)).toBe('unsaved');
  });

  it.each(['error', 'signed-out'] as const)('keeps the %s of the last save', (type) => {
    expect(saveStatus('extract_text', 'summarize', { type })).toBe(type);
    expect(saveStatus('summarize', 'summarize', { type })).toBe(type);
  });
});
