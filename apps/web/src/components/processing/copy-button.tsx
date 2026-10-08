'use client';

import { useEffect, useState } from 'react';

import { IconButton } from '@berrypjh/react-ui';
import { Check, Copy } from 'lucide-react';

import { COPIED, COPY, COPY_FAILED } from './result-copy';

type CopyState = 'idle' | 'copied' | 'failed';

/** 복사했다는 표시를 보이는 시간. 그 뒤 다시 누를 수 있는 모양으로 돌아간다. */
const RESET_MS = 2000;

/**
 * 결과 글 하나를 클립보드에 복사한다. 버튼 이름에 무엇을 복사하는지(`label`)를 담아 스크린 리더가 구분한다.
 * 결과는 같은 자리의 문구로 알린다 — 클립보드를 쓸 수 없는 브라우저면 직접 선택해 복사하라고 한다.
 */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<CopyState>('idle');

  useEffect(() => {
    if (state === 'idle') return;
    const timer = setTimeout(() => setState('idle'), RESET_MS);
    return () => clearTimeout(timer);
  }, [state]);

  const copy = () =>
    navigator.clipboard.writeText(text).then(
      () => setState('copied'),
      () => setState('failed'),
    );

  return (
    <div className="flex items-center gap-2">
      <span role="status" className="typo-caption-default text-text-light empty:sr-only">
        {state === 'copied' ? COPIED : state === 'failed' ? COPY_FAILED : ''}
      </span>
      {/* 아이콘 버튼은 오른쪽 선(edge="end")에 맞춰 아래 글 상자와 끝이 같다. 이름은 "원문 복사"처럼 무엇을 복사하는지까지다. */}
      <IconButton
        type="button"
        variant="text"
        size="sm"
        edge="end"
        aria-label={`${label} ${COPY}`}
        onClick={() => void copy()}
      >
        {state === 'copied' ? <Check aria-hidden size={18} /> : <Copy aria-hidden size={18} />}
      </IconButton>
    </div>
  );
}
