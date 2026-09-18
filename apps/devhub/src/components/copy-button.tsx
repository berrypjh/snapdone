'use client';

import { useState } from 'react';

import { Button, IconButton } from '@berrypjh/react-ui';

import { Icon } from './icon';

type CopyState = 'idle' | 'copied' | 'failed';

const STATUS: Record<CopyState, string> = {
  idle: '',
  copied: '복사했습니다',
  failed: '복사하지 못했습니다 — 글자를 직접 선택해 주세요',
};

/**
 * Copies `text` to the clipboard and says so in a polite live region. `icon` shows only a copy
 * icon (a check once copied); its accessible name still names what is copied.
 */
export function CopyButton({
  text,
  label,
  variant = 'text',
}: {
  text: string;
  label: string;
  variant?: 'text' | 'icon';
}) {
  const [state, setState] = useState<CopyState>('idle');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      setState('failed');
    }
  };

  const name = `${label}: ${text}`;

  if (variant === 'icon') {
    return (
      <span className="inline-flex items-center gap-1">
        <IconButton size="sm" color="secondary" aria-label={name} onClick={() => void copy()}>
          <Icon name={state === 'copied' ? 'check' : 'copy'} />
        </IconButton>
        {/* One stable live region; visible only when the reader must act. */}
        <span
          role="status"
          className={state === 'failed' ? 'typo-caption-small text-text-warning' : 'sr-only'}
        >
          {STATUS[state]}
        </span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <Button size="sm" variant="text" onClick={() => void copy()} aria-label={name}>
        {label}
      </Button>
      <span role="status" className="typo-caption-small text-text-light">
        {STATUS[state]}
      </span>
    </span>
  );
}
