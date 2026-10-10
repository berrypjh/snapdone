import { describe, expect, it } from 'vitest';

import { formatKoreanDateTime, formatKoreanDay, formatKoreanTime } from './datetime';

describe('formatKoreanDateTime', () => {
  it.each([
    ['2026-10-06T09:00:00Z', '2026. 10. 6. 오후 6:00'],
    ['2026-08-15T23:30:00Z', '2026. 8. 16. 오전 8:30'],
    ['2026-12-31T15:05:00Z', '2027. 1. 1. 오전 12:05'],
    ['2026-10-06T03:00:00Z', '2026. 10. 6. 오후 12:00'],
    ['2026-10-06T18:00:00+09:00', '2026. 10. 6. 오후 6:00'],
  ])('writes %s in Korea as %s', (iso, korean) => {
    expect(formatKoreanDateTime(iso)).toBe(korean);
  });
});

describe('formatKoreanDay and formatKoreanTime', () => {
  it('split the Korean date and time, crossing midnight in Korea', () => {
    expect(formatKoreanDay('2026-10-06T15:30:00Z')).toBe('2026. 10. 7.');
    expect(formatKoreanTime('2026-10-06T15:30:00Z')).toBe('오전 12:30');
    expect(formatKoreanTime('2026-10-06T05:07:00Z')).toBe('오후 2:07');
  });
});
