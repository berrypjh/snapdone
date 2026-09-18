'use client';

import { type ReactNode, useState } from 'react';

import { Button } from '@berrypjh/react-ui';

/**
 * Below `lg` the content folds behind a real disclosure button; from `lg` it is always shown and
 * the button is gone. Keeps a long list from pushing the workspace off a narrow screen.
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
