import { describe, expect, it } from 'vitest';

import { MAX_EMAIL_LENGTH, validateEmail } from './validation';

const addressOfLength = (length: number) =>
  `${'a'.repeat(length - '@example.com'.length)}@example.com`;

describe('validateEmail', () => {
  it('trims surrounding whitespace', () => {
    expect(validateEmail('  user@example.com \n')).toEqual({ ok: true, email: 'user@example.com' });
  });

  it('keeps Gmail dots, plus tags and letter case as typed', () => {
    expect(validateEmail('First.Last+tag@Gmail.com')).toEqual({
      ok: true,
      email: 'First.Last+tag@Gmail.com',
    });
  });

  it.each([
    '',
    '   ',
    'user',
    'user@',
    '@example.com',
    'user@example',
    'us er@example.com',
    'a@b@c.com',
  ])('rejects %j', (input) => {
    expect(validateEmail(input)).toEqual({ ok: false, error: 'invalid_email' });
  });

  it('accepts the maximum length and rejects one more', () => {
    expect(validateEmail(addressOfLength(MAX_EMAIL_LENGTH)).ok).toBe(true);
    expect(validateEmail(addressOfLength(MAX_EMAIL_LENGTH + 1)).ok).toBe(false);
  });

  it('measures length after trimming', () => {
    expect(validateEmail(` ${addressOfLength(MAX_EMAIL_LENGTH)} `).ok).toBe(true);
  });
});
