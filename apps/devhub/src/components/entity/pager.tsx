'use client';

// client component인 이유: `component={Link}`는 공용 Button에 함수를 넘기는데 Server
// Component는 그럴 수 없다. 공용 IconButton은 `component`를 받지 않아 router 링크가 못 된다.
import Link from 'next/link';

import { Button } from '@berrypjh/react-ui';

import type { Pager as PagerModel } from '@/lib/browser/pager';

import { detailsHref } from '../shell/workspace';
import { Icon } from '../ui/icon';

/** 화살표 하나. 이웃이 있으면 그 이름을 단 링크, 없으면 disabled 버튼이라 쌍이 자리를 지킨다. */
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

/** 순서에서 이전 · 다음 항목으로. 제목 줄 끝에 화살표 한 쌍으로 둔다. */
export function Pager({ pager }: { pager: PagerModel }) {
  return (
    <nav aria-label={`${pager.unit} 이동`} className="flex shrink-0 items-center">
      <Arrow link={pager.previous} unit={pager.unit} next={false} />
      <Arrow link={pager.next} unit={pager.unit} next />
    </nav>
  );
}
