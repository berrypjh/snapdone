import { describe, expect, it } from 'vitest';

import { FLASH_ATTRIBUTE, markAnchor } from './anchor-flash';

/** 요소 하나를 대신한다. 표시 함수가 무엇을 했는지 순서대로 기록한다. */
const element = () => {
  const calls: string[] = [];
  return {
    calls,
    offsetWidth: 0,
    removeAttribute: (name: string) => calls.push(`remove ${name}`),
    setAttribute: (name: string, value: string) =>
      calls.push(`set ${name}=${JSON.stringify(value)}`),
  };
};

const lookup = (ids: Record<string, ReturnType<typeof element>>) => ({
  getElementById: (id: string) => ids[id] ?? null,
});

describe('markAnchor', () => {
  it('marks the element the fragment names', () => {
    const heading = element();
    expect(markAnchor(lookup({ '22-source-link-policy': heading }), '#22-source-link-policy')).toBe(
      heading,
    );
    expect(heading.calls).toEqual([`remove ${FLASH_ATTRIBUTE}`, `set ${FLASH_ATTRIBUTE}=""`]);
  });

  it('reads a Korean heading id, which arrives percent-encoded', () => {
    const heading = element();
    const ids = lookup({ '버전-정책': heading });
    expect(markAnchor(ids, `#${encodeURIComponent('버전-정책')}`)).toBe(heading);
  });

  it('does nothing without a fragment, or when nothing carries that id', () => {
    const heading = element();
    const ids = lookup({ known: heading });
    expect(markAnchor(ids, '')).toBeNull();
    expect(markAnchor(ids, '#')).toBeNull();
    expect(markAnchor(ids, '#unknown')).toBeNull();
    expect(markAnchor(ids, '#%E0%A4%A')).toBeNull();
    expect(heading.calls).toEqual([]);
  });
});
