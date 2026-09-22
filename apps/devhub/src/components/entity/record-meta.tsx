import type { RecordRef } from '@/domain/model';
import { RECORD_KIND } from '@/lib/catalog/labels';

import { Icon } from '../ui/icon';

const CHIP = 'inline-flex items-center gap-1 rounded-sm bg-background-default px-1.5 py-0.5';

/** 기록의 날짜와 종류. 목록과 기록 머리가 같은 모양을 쓴다. */
export function RecordMeta({ record }: { record: RecordRef }) {
  return (
    <p className="flex flex-wrap items-center gap-1.5 typo-caption-small text-text-light">
      <span className={CHIP}>
        <Icon name="calendar" />
        <time dateTime={record.date}>{record.date}</time>
      </span>
      <span className={CHIP}>{RECORD_KIND[record.kind]}</span>
    </p>
  );
}
