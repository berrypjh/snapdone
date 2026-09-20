import { Chip } from '@berrypjh/react-ui';

import type { ImplementationStatus } from '@/domain/model';
import { STATUS } from '@/lib/catalog/labels';

/** 칩 색을 문서화된 CSS 변수로 지정한다. 뜻은 기호와 글자도 함께 전한다. */
const TONE: Record<ImplementationStatus, string> = {
  implemented:
    '[--ui-chip-fg:var(--ds-text-success)] [--ui-chip-border-color:var(--ds-stroke-success)]',
  partial:
    '[--ui-chip-fg:var(--ds-text-warning)] [--ui-chip-border-color:var(--ds-stroke-warning)]',
  'documented-only':
    '[--ui-chip-fg:var(--ds-text-light)] [--ui-chip-border-color:var(--ds-stroke-default)]',
  planned: '[--ui-chip-fg:var(--ds-text-light)] [--ui-chip-border-color:var(--ds-stroke-default)]',
  'not-found':
    '[--ui-chip-fg:var(--ds-text-error)] [--ui-chip-border-color:var(--ds-stroke-error)]',
};

export function StatusChip({ status }: { status: ImplementationStatus }) {
  const { label, glyph } = STATUS[status];
  return (
    <Chip size="sm" variant="outlined" className={TONE[status]} leading={glyph}>
      {label}
    </Chip>
  );
}
