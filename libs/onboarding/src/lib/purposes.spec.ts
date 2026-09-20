import { describe, expect, it } from 'vitest';

import { isPurposeSelection, type Purpose, togglePurpose } from './purposes';

describe('togglePurpose', () => {
  const press = (...purposes: Purpose[]) =>
    purposes.reduce<Purpose[]>((selected, purpose) => togglePurpose(selected, purpose), []);

  it('selects one purpose', () => {
    expect(press('food')).toEqual(['food']);
  });

  it('keeps several purposes in the fixed order', () => {
    expect(press('work', 'food', 'travel')).toEqual(['food', 'travel', 'work']);
  });

  it('deselects a purpose pressed again', () => {
    expect(press('food', 'travel', 'food')).toEqual(['travel']);
    expect(press('food', 'food')).toEqual([]);
  });

  it('leaves only unsure when unsure is chosen', () => {
    expect(press('food', 'events', 'unsure')).toEqual(['unsure']);
  });

  it('drops unsure when a purpose is chosen after it', () => {
    expect(press('unsure', 'receipt')).toEqual(['receipt']);
  });

  it('deselects unsure pressed again', () => {
    expect(press('unsure', 'unsure')).toEqual([]);
  });
});

describe('isPurposeSelection', () => {
  it('needs at least one purpose', () => {
    expect(isPurposeSelection([])).toBe(false);
    expect(isPurposeSelection(['food'])).toBe(true);
    expect(isPurposeSelection(['food', 'work'])).toBe(true);
  });

  it('accepts unsure alone as an answer', () => {
    expect(isPurposeSelection(['unsure'])).toBe(true);
  });

  it('rejects unsure mixed with another purpose', () => {
    expect(isPurposeSelection(['food', 'unsure'])).toBe(false);
  });
});
