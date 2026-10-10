import { describe, expect, it } from 'vitest';

import { photoForm } from './photoForm';

describe('photoForm', () => {
  it('puts the photo as a file object, not a uri descriptor, in the image field', () => {
    // 테스트에서는 Node의 FormData라 항목을 읽을 수 있다.
    const fields = new Map(photoForm('file:///cache/photo.jpg') as unknown as [string, unknown][]);
    expect(fields.get('image')).toBeInstanceOf(Blob);
  });
});
