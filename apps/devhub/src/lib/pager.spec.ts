import { describe, expect, it } from 'vitest';

import { pagerOf } from './pager';

const items = ['a', 'b', 'c'].map((id) => ({ id, label: id.toUpperCase(), href: `/${id}` }));

describe('pagerOf', () => {
  it('gives both neighbours in the middle', () => {
    expect(pagerOf('단계', items, 'b')).toEqual({
      unit: '단계',
      previous: { label: 'A', href: '/a' },
      next: { label: 'C', href: '/c' },
    });
  });

  it('has no previous at the start and no next at the end', () => {
    expect(pagerOf('단계', items, 'a')?.previous).toBeUndefined();
    expect(pagerOf('단계', items, 'c')?.next).toBeUndefined();
  });

  it('is undefined for an item outside the order', () => {
    expect(pagerOf('단계', items, 'z')).toBeUndefined();
  });
});
