import { describe, expect, it } from 'vitest';

import { IMAGE_TYPES, isActionFor, parseOutcome, parseSelection } from './outcome';
import { RECEIPT_ACTIONS, TEXT_ACTIONS } from './preferences';

const field = (value: string | null, candidates: string[] = [], resolved = value !== null) => ({
  value,
  candidates,
  resolved,
});

const expense = {
  merchant: field('카페 봄'),
  date: field(null),
  total: field('12000', ['12000', '13000'], false),
  currency: field('KRW'),
  paymentMethod: field(null),
};

/** 처리 방식마다 계약을 지키는 결과. Go `outcome_test.go`의 `processed`와 같은 짝이다. */
const OUTPUTS = {
  text: {
    extract_and_translate: {
      original: 'Open daily',
      translation: { needed: true, text: '매일 영업' },
    },
    extract_text: { original: 'Open daily' },
    summarize: { summary: '영업시간 안내' },
    extract_and_summarize: { original: 'Open daily', summary: '영업시간 안내' },
  },
  receipt: {
    record_expense: { expense },
    extract_text: { original: '카페 봄 12,000원' },
    summarize: { summary: '카페 봄 결제' },
  },
};

const processed = (imageType: string, appliedAction: string, output: unknown) => ({
  kind: 'processed',
  imageType,
  appliedAction,
  output,
});

describe('isActionFor', () => {
  it('allows each image type only its own preference actions', () => {
    for (const action of TEXT_ACTIONS) expect(isActionFor('text', action)).toBe(true);
    for (const action of RECEIPT_ACTIONS) expect(isActionFor('receipt', action)).toBe(true);
    expect(isActionFor('text', 'record_expense')).toBe(false);
    expect(isActionFor('receipt', 'extract_and_translate')).toBe(false);
    expect(isActionFor('receipt', 'extract_and_summarize')).toBe(false);
    expect(isActionFor('text', 'translate')).toBe(false);
  });

  it('knows exactly the two product image types', () => {
    expect(IMAGE_TYPES).toEqual(['text', 'receipt']);
  });
});

describe('parseOutcome', () => {
  it.each(
    Object.entries(OUTPUTS).flatMap(([imageType, actions]) =>
      Object.entries(actions).map(([action, output]) => [imageType, action, output] as const),
    ),
  )('reads %s %s', (imageType, action, output) => {
    const value = processed(imageType, action, output);
    expect(parseOutcome(value)).toEqual(value);
  });

  it('covers every allowed pair', () => {
    expect(Object.keys(OUTPUTS.text)).toEqual([...TEXT_ACTIONS]);
    expect(Object.keys(OUTPUTS.receipt)).toEqual([...RECEIPT_ACTIONS]);
  });

  it('reads the Go wire body of a receipt with unresolved and uncertain fields', () => {
    // apps/api/internal/httpserver/processing_test.go TestProcessingJobsOutcome의 job-1 outcome
    const body = JSON.parse(
      '{"kind":"processed","imageType":"receipt","appliedAction":"record_expense","output":{"expense":{' +
        '"merchant":{"value":"카페 봄","candidates":[],"resolved":true},' +
        '"date":{"value":null,"candidates":[],"resolved":false},' +
        '"total":{"value":"12000","candidates":["12000","13000"],"resolved":false},' +
        '"currency":{"value":"KRW","candidates":[],"resolved":true},' +
        '"paymentMethod":{"value":null,"candidates":[],"resolved":false}}}}',
    );
    expect(parseOutcome(body)).toEqual(processed('receipt', 'record_expense', { expense }));
  });

  it('reads a translation that was not needed', () => {
    const value = processed('text', 'extract_and_translate', {
      original: '영업 중',
      translation: { needed: false, text: null },
    });
    expect(parseOutcome(value)).toEqual(value);
  });

  it('reads an ISO date and an unresolved currency', () => {
    const output = { expense: { ...expense, date: field('2026-10-07'), currency: field(null) } };
    expect(parseOutcome(processed('receipt', 'record_expense', output))).not.toBeNull();
  });

  it('tells unsupported and ambiguous apart', () => {
    expect(parseOutcome({ kind: 'unsupported' })).toEqual({ kind: 'unsupported' });
    expect(parseOutcome({ kind: 'ambiguous', candidates: ['text', 'receipt'] })).toEqual({
      kind: 'ambiguous',
      candidates: ['text', 'receipt'],
    });
  });

  it('reads receipt fields that are unresolved, uncertain, or only have candidates', () => {
    for (const total of [
      field(null),
      field(null, ['12000', '13000'], false),
      field('12000', ['12000'], false),
      field('12000', ['13000'], true),
      field('12.50'),
    ]) {
      const output = { expense: { ...expense, total } };
      expect(parseOutcome(processed('receipt', 'record_expense', output))).not.toBeNull();
    }
  });

  it.each([
    ['text with record_expense', processed('text', 'record_expense', { expense })],
    [
      'receipt with translate',
      processed('receipt', 'extract_and_translate', OUTPUTS.text.extract_and_translate),
    ],
    ['a missing translation', processed('text', 'extract_and_translate', { original: 'a' })],
    [
      'a translation as plain text',
      processed('text', 'extract_and_translate', { original: 'a', translation: 'b' }),
    ],
    [
      'a needed translation without text',
      processed('text', 'extract_and_translate', {
        original: 'a',
        translation: { needed: true, text: null },
      }),
    ],
    [
      'an unneeded translation with text',
      processed('text', 'extract_and_translate', {
        original: 'a',
        translation: { needed: false, text: 'b' },
      }),
    ],
    [
      'an amount as written',
      processed('receipt', 'record_expense', { expense: { ...expense, total: field('12,000원') } }),
    ],
    [
      'a candidate that is not an amount',
      processed('receipt', 'record_expense', {
        expense: { ...expense, total: field(null, ['12000', '만이천'], false) },
      }),
    ],
    [
      'a date without a year',
      processed('receipt', 'record_expense', { expense: { ...expense, date: field('10-07') } }),
    ],
    [
      'an impossible date',
      processed('receipt', 'record_expense', {
        expense: { ...expense, date: field('2026-02-30') },
      }),
    ],
    [
      'a currency word',
      processed('receipt', 'record_expense', { expense: { ...expense, currency: field('원') } }),
    ],
    [
      'a missing currency',
      processed('receipt', 'record_expense', { expense: { ...expense, currency: undefined } }),
    ],
    ['an extra summary', processed('text', 'extract_text', { original: 'a', summary: 'b' })],
    ['an empty original', processed('text', 'extract_text', { original: '' })],
    ['no output', { kind: 'processed', imageType: 'text', appliedAction: 'extract_text' }],
    ['an unknown image type', processed('place', 'extract_text', { original: 'a' })],
    ['an unknown kind', { kind: 'done' }],
    ['unsupported with an image type', { kind: 'unsupported', imageType: 'text' }],
    ['ambiguous without candidates', { kind: 'ambiguous', candidates: [] }],
    ['ambiguous with an unknown type', { kind: 'ambiguous', candidates: ['place'] }],
    ['ambiguous with a duplicate', { kind: 'ambiguous', candidates: ['text', 'text'] }],
    [
      'a resolved field without a value',
      processed('receipt', 'record_expense', {
        expense: { ...expense, date: field(null, [], true) },
      }),
    ],
    [
      'an uncertain value outside the candidates',
      processed('receipt', 'record_expense', {
        expense: { ...expense, total: field('12000', ['13000'], false) },
      }),
    ],
    [
      'an empty candidate',
      processed('receipt', 'record_expense', {
        expense: { ...expense, total: field(null, [''], false) },
      }),
    ],
    [
      'a missing receipt field',
      processed('receipt', 'record_expense', { expense: { ...expense, date: undefined } }),
    ],
    ['null', null],
  ])('rejects %s', (_name, value) => {
    expect(parseOutcome(value)).toBeNull();
  });
});

describe('parseSelection', () => {
  it('reads every allowed pair', () => {
    for (const appliedAction of TEXT_ACTIONS) {
      expect(parseSelection({ imageType: 'text', appliedAction })).toEqual({
        imageType: 'text',
        appliedAction,
      });
    }
    for (const appliedAction of RECEIPT_ACTIONS) {
      expect(parseSelection({ imageType: 'receipt', appliedAction })).toEqual({
        imageType: 'receipt',
        appliedAction,
      });
    }
  });

  it.each([
    ['text with record_expense', { imageType: 'text', appliedAction: 'record_expense' }],
    ['receipt with translate', { imageType: 'receipt', appliedAction: 'extract_and_translate' }],
    ['an unknown type', { imageType: 'place', appliedAction: 'extract_text' }],
    ['a missing action', { imageType: 'text' }],
    ['an extra key', { imageType: 'text', appliedAction: 'extract_text', confidence: 'high' }],
    ['null', null],
  ])('rejects %s', (_name, value) => {
    expect(parseSelection(value)).toBeNull();
  });
});
