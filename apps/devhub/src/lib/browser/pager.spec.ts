import { describe, expect, it } from 'vitest';

import { pagerOf } from './pager';

const items = ['a', 'b', 'c'].map((id) => ({ id, label: id.toUpperCase(), href: `/${id}` }));

describe('pagerOf', () => {
  it('gives the shared Pager the whole order and the current item', () => {
    expect(pagerOf('단계', items, 'b')).toEqual({ unit: '단계', entities: items, current: 'b' });
  });

  it('is undefined for an item outside the order', () => {
    expect(pagerOf('단계', items, 'z')).toBeUndefined();
  });
});
