'use client';

import { type ReactNode, useState } from 'react';

import { Button } from '@berrypjh/react-ui';

/**
 * `lg` 아래에서는 내용을 disclosure 버튼 뒤로 접고, `lg`부터는 늘 보이며 버튼이 사라진다.
 * 긴 목록이 좁은 화면에서 작업 영역을 밀어내지 않게 한다.
 */
export function NarrowDisclosure({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="p-3 lg:hidden">
        <Button
          size="sm"
          variant="outlined"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((current) => !current)}
        >
          {label} <span aria-hidden="true">{open ? '▴' : '▾'}</span>
        </Button>
      </div>
      <div id={id} className={open ? undefined : 'hidden lg:block'}>
        {children}
      </div>
    </>
  );
}
