import Link from 'next/link';

import { RecordMeta, WorkspaceSection } from '@berrypjh/devhub-ui';

import { entityHref, RECORDS_NEWEST_FIRST } from '@/lib/catalog/entities';
import { RECORD_KIND } from '@/lib/catalog/labels';

/**
 * 개발 기록을 최신순 목록으로. 언제 · 어떤 종류 · 무엇으로 결론 났는지 한 줄씩 보여서 무엇을
 * 열지 고르게 한다.
 */
export function RecordList() {
  return (
    <WorkspaceSection id="section-list" title={`${RECORDS_NEWEST_FIRST.length}개`}>
      <ul className="flex flex-col divide-y divide-stroke-light">
        {RECORDS_NEWEST_FIRST.map((record) => (
          <li key={record.id} className="flex flex-col gap-1 py-3">
            <RecordMeta date={record.date} kind={RECORD_KIND[record.kind]} />
            <Link
              href={entityHref({ section: 'records', id: record.id })}
              className="typo-body-small-strong text-text-link underline-offset-2 hover:underline"
            >
              {record.title}
            </Link>
            <p className="typo-body-small text-text-light">{record.summary}</p>
          </li>
        ))}
      </ul>
    </WorkspaceSection>
  );
}
