import { describe, expect, it } from 'vitest';

import { FAILED_TITLE, FAILURE_COPY, PROCESSING_MESSAGE } from './processingCopy';

describe('processing copy', () => {
  it('never shows a technical term or a code', () => {
    const texts = [
      PROCESSING_MESSAGE,
      FAILED_TITLE,
      ...Object.values(FAILURE_COPY).map((copy) => copy.message),
    ];

    for (const text of texts) expect(text).not.toMatch(/[A-Za-z_]/);
  });

  it('offers another photo instead of a retry when the photo itself cannot be processed', () => {
    expect(FAILURE_COPY.unsupported.retry).toBe(false);
    expect(FAILURE_COPY['too-large'].retry).toBe(false);
    expect(FAILURE_COPY.network.retry).toBe(true);
    expect(FAILURE_COPY.failed.retry).toBe(true);
  });
});
