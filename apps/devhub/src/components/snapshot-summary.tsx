import { shortSha } from '@/domain/links';
import { currentSnapshot } from '@/lib/snapshot';

const SOURCE = { env: '빌드 환경', git: 'git', unavailable: '' } as const;

/** Which commit the DevHub links point at, or plainly that it is unknown. */
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
