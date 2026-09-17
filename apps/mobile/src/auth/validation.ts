export const MAX_EMAIL_LENGTH = 254;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type EmailValidation = { ok: true; email: string } | { ok: false; error: 'invalid_email' };

export const validateEmail = (input: string): EmailValidation => {
  const email = input.trim();

  if (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
    return { ok: false, error: 'invalid_email' };
  }

  return { ok: true, email };
};
