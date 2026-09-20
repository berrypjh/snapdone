import { describe, expect, it } from 'vitest';

import { captureNotice } from './captureCopy';

describe('captureNotice', () => {
  it('says nothing after a pick or a cancel', () => {
    expect(
      captureNotice({ type: 'selected', image: { uri: 'file:///cache/photo.jpg' } }),
    ).toBeNull();
    expect(captureNotice({ type: 'cancelled' })).toBeNull();
  });

  it('asks again in the app while the system can still ask', () => {
    expect(captureNotice({ type: 'camera-denied', canAskAgain: true })).toEqual({
      message: expect.stringContaining('권한을 허용해 주세요'),
      openSettings: false,
    });
  });

  it('points to settings once the system will not ask again', () => {
    expect(captureNotice({ type: 'camera-denied', canAskAgain: false })?.openSettings).toBe(true);
  });

  it('offers the photo library when the camera cannot open', () => {
    expect(captureNotice({ type: 'failed', source: 'camera' })?.message).toContain(
      '사진에서 선택해 주세요',
    );
    expect(captureNotice({ type: 'failed', source: 'library' })?.message).toContain('다시 시도');
  });

  it('never shows a technical code', () => {
    const notices = [
      captureNotice({ type: 'camera-denied', canAskAgain: true }),
      captureNotice({ type: 'camera-denied', canAskAgain: false }),
      captureNotice({ type: 'failed', source: 'camera' }),
      captureNotice({ type: 'failed', source: 'library' }),
    ];

    for (const notice of notices) expect(notice?.message).not.toMatch(/[A-Za-z_]/);
  });
});
