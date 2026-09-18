'use client';

import { useEffect, useState } from 'react';

import type { OutlineItem } from '@/lib/documents';

/**
 * "이 페이지에서": the document's sections, with the one being read marked
 * (`aria-current="location"`) as the workspace scrolls.
 */
export function DocToc({ items }: { items: OutlineItem[] }) {
  const [active, setActive] = useState(items[0]?.id);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((entry) => entry.isIntersecting);
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: '0px 0px -75% 0px' },
    );
    for (const { id } of items) {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [items]);

  return (
    <ol className="flex flex-col border-l border-stroke-light">
      {items.map((item) => (
        <li key={item.id}>
          <a
            href={`#${item.id}`}
            aria-current={item.id === active ? 'location' : undefined}
            className="-ml-px block border-l-2 border-transparent py-1 pl-3 typo-caption-small text-text-light hover:text-text-default aria-[current=location]:border-stroke-primary aria-[current=location]:text-text-default aria-[current=location]:typo-body-small-strong"
          >
            {item.title}
          </a>
        </li>
      ))}
    </ol>
  );
}
