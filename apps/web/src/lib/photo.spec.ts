import { MAX_IMAGE_BYTES } from '@snapdone/onboarding';
import { describe, expect, it } from 'vitest';

import { checkPhoto } from './photo';

const file = (name: string, type: string, size = 3) =>
  new File([new Uint8Array(size)], name, { type });

describe('checkPhoto', () => {
  it('takes one supported photo', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/gif', 'image/webp']) {
      const photo = file('photo', type);
      expect(checkPhoto([photo])).toEqual({ type: 'photo', file: photo });
    }
  });

  it('treats no file (a cancelled picker) as nothing chosen, not an error', () => {
    expect(checkPhoto([])).toEqual({ type: 'none' });
  });

  it('refuses more than one photo, another format, and a photo over the server limit', () => {
    expect(checkPhoto([file('a.png', 'image/png'), file('b.png', 'image/png')])).toEqual({
      type: 'invalid',
      reason: 'multiple',
    });
    expect(checkPhoto([file('photo.heic', 'image/heic')])).toEqual({
      type: 'invalid',
      reason: 'format',
    });
    expect(checkPhoto([file('note.pdf', 'application/pdf')])).toEqual({
      type: 'invalid',
      reason: 'format',
    });
    expect(checkPhoto([file('big.png', 'image/png', MAX_IMAGE_BYTES + 1)])).toEqual({
      type: 'invalid',
      reason: 'too-large',
    });
  });

  it('leaves a file of unknown type to the server, which judges it by content', () => {
    const unknown = file('photo', '');
    expect(checkPhoto([unknown])).toEqual({ type: 'photo', file: unknown });
  });

  it('accepts a photo exactly at the server limit', () => {
    const edge = file('edge.png', 'image/png', MAX_IMAGE_BYTES);
    expect(checkPhoto([edge])).toEqual({ type: 'photo', file: edge });
  });
});
