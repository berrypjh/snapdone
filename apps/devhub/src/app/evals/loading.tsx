import { EvalsGuide } from '@/components/evals/evals-guide';
import { DevHubShell } from '@/components/shell/devhub-shell';
import { WorkspaceFrame } from '@/components/shell/workspace';

/**
 * 결과 파일 · 공급자 모델 목록을 읽는 동안. 평가 page가 셸까지 그리므로 이 fallback도 셸을 그려야
 * 탐색기 · 상단 막대가 사라지지 않는다. 작업 영역 자리에만 읽는 중이라고 보인다.
 */
export default function Loading() {
  return (
    <DevHubShell selection={{ view: 'evals' }} inspector={<EvalsGuide />}>
      <WorkspaceFrame>
        <p role="status" className="typo-body-small text-text-light">
          평가 결과를 읽는 중…
        </p>
      </WorkspaceFrame>
    </DevHubShell>
  );
}
