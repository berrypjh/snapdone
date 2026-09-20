import { shortSha } from '@/domain/links';
import { currentSnapshot } from '@/lib/snapshot';

const SOURCE = { env: '빌드 환경', git: 'git', unavailable: '' } as const;

/** DevHub 링크가 어느 커밋을 가리키는지. 모르면 모른다고 밝힌다. */
export function SnapshotSummary() {
  const { commit, source, dirty, branch } = currentSnapshot();
  return (
    <span className="typo-caption-small">
      {commit ? (
        <>
          스냅샷 <span className="devhub-code">{shortSha(commit)}</span> ({SOURCE[source]}) · 브랜치{' '}
          {branch}
          {dirty && <span className="text-text-warning"> · 커밋 이후 로컬 변경 있음</span>}
        </>
      ) : (
        <span className="text-text-warning">
          스냅샷 커밋을 알 수 없음 — {branch} 브랜치 링크만 제공
        </span>
      )}
    </span>
  );
}
