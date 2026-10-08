'use client';

import { useId, useState } from 'react';

import { Button } from '@berrypjh/react-ui';

import { collapse, expand } from './result-copy';

/** 접은 원문이 보이는 줄 수. 이보다 길면 "전체 보기"로 편다. */
const FOLDED_LINES = 6;
const FOLDED_CHARS = 300;

/**
 * 결과 글 하나. `foldable`(다른 결과 글이 함께 있는 원문)이면서 길면 처음 몇 줄만 보이고 전체 보기로 편다.
 * 접어도 글은 그대로 있어 복사 · 스크린 리더는 전체를 다룬다.
 */
export function ResultText({
  text,
  label,
  foldable,
}: {
  text: string;
  label: string;
  foldable: boolean;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const long = foldable && (text.split('\n').length > FOLDED_LINES || text.length > FOLDED_CHARS);
  return (
    <div className="flex flex-col gap-2">
      <p
        id={id}
        className={`typo-paragraph-default break-words whitespace-pre-wrap ${long && !open ? 'line-clamp-6' : ''}`}
      >
        {text}
      </p>
      {long && (
        <Button
          type="button"
          variant="text"
          size="sm"
          className="self-start"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? collapse(label) : expand(label)}
        </Button>
      )}
    </div>
  );
}
