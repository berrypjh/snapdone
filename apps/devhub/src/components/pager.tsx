'use client';

// A client component: `component={Link}` hands a function to the shared Button, which a Server
// Component cannot do. The shared IconButton takes no `component`, so it cannot be a router link.
import Link from 'next/link';

import { Button } from '@berrypjh/react-ui';

import type { Pager as PagerModel } from '@/lib/pager';

import { Icon } from './icon';
import { detailsHref } from './workspace';

/**
 * One arrow. With a neighbour it is a link named after it; without one it is a disabled button,
 * so the pair keeps its place.
 */
function Arrow({
  link,
  unit,
  next,
}: {
  link?: { label: string; href: string };
  unit: string;
  next: boolean;
}) {
  const hint = next ? `다음 ${unit}` : `이전 ${unit}`;
  const icon = <Icon name={next ? 'chevron-right' : 'chevron-left'} />;
  if (!link) {
    return (
      <Button size="sm" variant="text" color="secondary" disabled aria-label={`${hint} 없음`}>
        {icon}
      </Button>
    );
  }
  return (
    <Button
      component={Link}
      href={detailsHref(link.href)}
      size="sm"
      variant="text"
      color="secondary"
      aria-label={`${hint}: ${link.label}`}
      title={hint}
    >
      {icon}
    </Button>
  );
}

/** Previous and next item in an order, as a pair of arrows at the end of the title row. */
export function Pager({ pager }: { pager: PagerModel }) {
  return (
    <nav aria-label={`${pager.unit} 이동`} className="flex shrink-0 items-center">
      <Arrow link={pager.previous} unit={pager.unit} next={false} />
      <Arrow link={pager.next} unit={pager.unit} next />
    </nav>
  );
}
