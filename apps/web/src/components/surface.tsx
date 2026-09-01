import type { HTMLAttributes } from 'react';

type SurfaceProps = HTMLAttributes<HTMLDivElement> & {
  muted?: boolean;
};

export function Surface({ muted = false, className, ...props }: SurfaceProps) {
  const classes = [
    'rounded-lg border border-border p-5',
    muted ? 'bg-surface-muted' : 'bg-surface shadow-card',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return <div className={classes} {...props} />;
}
