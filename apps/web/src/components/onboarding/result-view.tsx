'use client';

import { startTransition, useActionState } from 'react';
import { unstable_rethrow } from 'next/navigation';

import { Button } from '@berrypjh/react-ui';
import { isProcessed, type JobDetail } from '@snapdone/processing';

import { completeOnboarding } from '@/lib/onboarding/actions';

import { ProcessingResult, type SessionImage } from '../processing/processing-result';
import { ReprocessPanel } from '../processing/reprocess-panel';

/** 로그인 뒤 돌아올 곳. 온보딩 진행은 서버에 있어 같은 단계에서 이어 간다. */
const RETURN_TO = '/onboarding';

type ResultViewProps = {
  image: SessionImage;
  /** 첫 사진의 처리 결과. 일반 사진과 같은 계약이다. */
  job: JobDetail;
  /** 다른 방식으로 다시 처리해 처리를 마친 작업. 온보딩 단계는 바뀌지 않는다. */
  onReprocessed: (job: JobDetail) => void;
};

/**
 * 완료 Action을 부른다. 성공 · 로그인 만료 · 단계 어긋남은 redirect로 끝나고, 그 redirect는
 * Action 호출의 거절로 오므로 router에 다시 던진다. 그 밖의 거절(연결 끊김)과 돌아온 값은 실패다.
 */
const finish = async (): Promise<{ failed: boolean }> => {
  try {
    return { failed: (await completeOnboarding()).type === 'error' };
  } catch (error) {
    unstable_rethrow(error);
    return { failed: true };
  }
};

/**
 * 첫 결과. 서버가 실제로 처리한 결과와 적용한 처리 방식을 일반 사진의 결과 화면(`ProcessingResult`)으로 보이고,
 * 같은 사진을 다른 방식으로 다시 처리할 수 있다. 완료를 눌러야만 서버가 온보딩을 끝내고 홈으로 보낸다.
 * 완료에 실패해도 사진과 결과는 그대로 두고 다시 시도한다.
 */
export function ResultView({ image, job, onReprocessed }: ResultViewProps) {
  const [{ failed }, complete, pending] = useActionState(finish, { failed: false });

  return (
    <div className="flex flex-col gap-6">
      <ProcessingResult
        key={job.jobId}
        initial={job}
        image={image}
        returnTo={RETURN_TO}
        focusOnOpen
      />
      {/* 결과 밖에 두어, 다시 처리해 결과가 바뀌어도 기본값 저장 상태가 남는다. */}
      {isProcessed(job) && (
        <ReprocessPanel
          job={job}
          file={image.file}
          onReprocessed={onReprocessed}
          returnTo={RETURN_TO}
        />
      )}

      {/* 끝내는 버튼은 하나뿐인 주 행동이라 화면 아래에 붙여 둔다. 긴 결과를 읽는 중에도 바로 누른다. */}
      <div className="sticky bottom-0 flex flex-col gap-2 border-t border-stroke-light bg-background-surface py-4">
        {failed && !pending && (
          <p role="alert" className="text-center typo-paragraph-default">
            완료하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.
          </p>
        )}
        <Button
          type="button"
          variant="contained"
          size="lg"
          fullWidth
          loading={pending}
          disabled={pending}
          onClick={() => startTransition(complete)}
        >
          완료
        </Button>
      </div>
    </div>
  );
}
