import type { ReactNode } from 'react';

import type { RunDetail } from '@/lib/evaluations/repository';
import { retryGuide } from '@/lib/evaluations/retry';

import { WorkspaceSection } from '../../shell/workspace';
import { CopyButton } from '../../source/copy-button';
import { Icon } from '../../ui/icon';

function Command({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <p className="typo-caption-small text-text-light">{title}</p>
        <CopyButton text={text} label={`${title} 복사`} variant="icon" />
      </div>
      <pre className="overflow-x-auto rounded-md bg-background-default p-3 devhub-code">{text}</pre>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex flex-col gap-2">
      <h3 className="typo-body-small-strong">
        {n}. {title}
      </h3>
      {children}
    </li>
  );
}

/**
 * 실제 모델 호출이 실패한 run에만 보이는 안내. 원인을 확인한 뒤 `pnpm eval retry`로 실패한 것만 다시 부르면 성공한
 * 결과와 한 run에 모인다.
 */
export function RetryGuide({ run }: { run: RunDetail }) {
  const guide = retryGuide(run);
  if (!guide) return null;
  const total = guide.failed.reduce((sum, f) => sum + f.failed, 0);
  return (
    <WorkspaceSection id="run-retry" title={`실패한 호출 ${total}개 — 다시 실행 안내`}>
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
      <ol className="flex flex-col gap-4">
        <Step n={1} title="원인 확인 — 거절 이유는 결과에 저장하지 않음">
          <p className="typo-caption-small text-text-light">
            별도 터미널에서 한 번 호출. 응답의 message가 이유(크레딧 부족 · key 오류 · 요청 한도
            등). 400이 크레딧 부족인 경우가 많음
          </p>
          {guide.probes.map((p) => (
            <Command key={p.provider} title={`${p.provider} 확인`} text={p.command} />
          ))}
        </Step>
        <Step n={2} title="실패한 것만 다시 — 성공한 모델과 한 run으로">
          <Command title="다시 실행" text={guide.rerun} />
        </Step>
      </ol>
    </WorkspaceSection>
  );
}
