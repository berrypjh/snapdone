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
 * `text`를 클립보드에 복사하고 polite live region으로 결과를 알린다. `icon`은 복사 아이콘만
 * 보이지만(복사 후에는 체크) 접근성 이름에는 무엇을 복사하는지 그대로 담는다.
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
        {/* 항상 같은 자리의 live region. 사용자가 직접 해야 할 때만 눈에 보인다. */}
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
