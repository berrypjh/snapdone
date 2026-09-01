import type { ButtonHTMLAttributes } from 'react';

type ButtonVariant = 'primary' | 'secondary';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

const base =
  'inline-flex min-h-11 items-center justify-center rounded-md px-4 text-button font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45';

const byVariant: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-on-primary hover:bg-primary-hover active:bg-primary-pressed disabled:hover:bg-primary',
  secondary:
    'border border-border bg-surface text-text-primary hover:bg-surface-muted active:bg-surface-muted disabled:hover:bg-surface',
};

export function Button({ variant = 'primary', type = 'button', className, ...props }: ButtonProps) {
  const classes = [base, byVariant[variant], className].filter(Boolean).join(' ');

  return <button type={type} className={classes} {...props} />;
}
