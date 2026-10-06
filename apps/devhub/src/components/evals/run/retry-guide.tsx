import { CopyButton, Icon, WorkspaceSection } from '@berrypjh/devhub-ui';

import type { RunDetail } from '@/lib/evaluations/repository';
import { retryGuide } from '@/lib/evaluations/retry';

/**
 * 실제 모델 호출이 실패한 run에만 보이는 안내. `pnpm eval retry`로 실패한 것만 다시 부르면 성공한 결과와 한 run에
 * 모인다. 거절 이유는 결과에 저장하지 않으므로 오류 class · kind만 보이고, 원인 확인은 공급자 콘솔이나 터미널에서 한다.
 */
export function RetryGuide({ run }: { run: RunDetail }) {
  const guide = retryGuide(run);
  if (!guide) return null;
  const total = guide.failed.reduce((sum, f) => sum + f.failed, 0);
  return (
    <WorkspaceSection id="run-retry" title={`실패한 호출 ${total}개 — 다시 실행`}>
      <ul className="flex flex-col gap-1">
        {guide.failed.map((f) => (
          <li key={f.id} className="flex flex-col gap-0.5">
            <p className="flex items-center gap-1.5 typo-body-small text-text-warning">
              <Icon name="warning" />
              <span className="devhub-code">{f.id}</span> 실패 {f.failed} / {f.invocations}번
            </p>
            {f.errors.map((e) => (
              <p key={e.text} className="pl-6 typo-caption-small text-text-light">
                {e.text}
                {e.count > 1 && ` × ${e.count}`}
              </p>
            ))}
          </li>
        ))}
      </ul>
      <p className="typo-caption-small text-text-light">
        성공한 결과 {guide.carried}개는 호출 없이 옮기고 실패한 {guide.calls}개만 다시 부름 → 모든
        variant가 든 새 run <span className="devhub-code">{guide.retryId}</span>. 이 run은 그대로
        남음
      </p>
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <p className="typo-caption-small text-text-light">다시 실행</p>
          <CopyButton text={guide.rerun} label={`다시 실행 명령 복사: ${guide.rerun}`} />
        </div>
        <pre className="overflow-x-auto rounded-md bg-background-default p-3 devhub-code">
          {guide.rerun}
        </pre>
      </div>
    </WorkspaceSection>
  );
}
