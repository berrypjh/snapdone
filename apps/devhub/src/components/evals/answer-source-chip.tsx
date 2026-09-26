import { Chip } from '@berrypjh/react-ui';

import { ANSWER_SOURCE, type AnswerSource } from '@/lib/evaluations/presentation';

/** 실제 모델이 아닌 답은 경고색. 뜻은 기호와 글자가 전하고 title에 설명이 있다. */
const TONE: Record<AnswerSource, string> = {
  model: '[--ui-chip-fg:var(--ds-text-success)] [--ui-chip-border-color:var(--ds-stroke-success)]',
  rule: '[--ui-chip-fg:var(--ds-text-warning)] [--ui-chip-border-color:var(--ds-stroke-warning)]',
  recorded:
    '[--ui-chip-fg:var(--ds-text-warning)] [--ui-chip-border-color:var(--ds-stroke-warning)]',
};

export function AnswerSourceChip({ source }: { source: AnswerSource }) {
  const { label, glyph, note } = ANSWER_SOURCE[source];
  return (
    <span title={note}>
      <Chip size="sm" variant="outlined" className={TONE[source]} leading={glyph}>
        {label}
      </Chip>
    </span>
  );
}
