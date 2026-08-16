import type { HTMLAttributes } from 'react';

type SurfaceProps = HTMLAttributes<HTMLDivElement> & {
  /** Recessed background for secondary content. Drops the shadow. */
  muted?: boolean;
};

/** A bordered content block. The only card treatment in the web app. */
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
