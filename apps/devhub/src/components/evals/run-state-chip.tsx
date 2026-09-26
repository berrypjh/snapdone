import { Chip } from '@berrypjh/react-ui';

import { RUN_STATE, type RunState } from '@/lib/evaluations/overview';

/** 칩 색은 보조이고 뜻은 기호와 글자가 전한다(StatusChip과 같은 방식). */
const TONE: Record<RunState, string> = {
  completed:
    '[--ui-chip-fg:var(--ds-text-success)] [--ui-chip-border-color:var(--ds-stroke-success)]',
  partial:
    '[--ui-chip-fg:var(--ds-text-warning)] [--ui-chip-border-color:var(--ds-stroke-warning)]',
  incomplete:
    '[--ui-chip-fg:var(--ds-text-light)] [--ui-chip-border-color:var(--ds-stroke-default)]',
  unreadable: '[--ui-chip-fg:var(--ds-text-error)] [--ui-chip-border-color:var(--ds-stroke-error)]',
};

export function RunStateChip({ state }: { state: RunState }) {
  const { label, glyph } = RUN_STATE[state];
  return (
    <Chip size="sm" variant="outlined" className={TONE[state]} leading={glyph}>
      {label}
    </Chip>
  );
}
