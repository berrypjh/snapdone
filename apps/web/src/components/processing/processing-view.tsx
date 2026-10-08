'use client';

import { useEffect, useRef, useState } from 'react';

import { Button } from '@berrypjh/react-ui';
import {
  type CompletedJob,
  type ProcessingJob,
  type ProcessingPort,
  type ProcessingState,
  runProcessing,
} from '@snapdone/onboarding';

import { FAILED_TITLE, FAILURE_COPY, PROCESSING_MESSAGE } from './processing-copy';
import { ProcessingBar, ScanOverlay } from './processing-indicator';
import { SelectedImage } from './selected-image';

type ProcessingViewProps<Job extends ProcessingJob> = {
  image: File;
  url: string;
  port: ProcessingPort<File, Job>;
  onCompleted: (job: CompletedJob<Job>) => void;
  onChooseAnother: () => void;
};

/**
 * 사진 처리. 사진을 보내고 작업이 끝날 때까지 기다린다. 온보딩 첫 사진과 일반 사진이 같이 쓴다.
 * 서버가 알려주는 것은 처리 중 · 완료 · 실패뿐이라 중간 단계를 지어내지 않는다. 화면을 떠나면 조회를 멈춘다.
 * 완료되면 끝난 작업을 `onCompleted`로 넘기고, 결과 화면은 부모가 연다. mobile 처리 화면과 같은 경계다.
 * 시도(처음 · 다시 시도)마다 처리 요청은 한 번이다. 이전 시도의 응답은 화면을 바꾸지 않는다.
 */
export function ProcessingView<Job extends ProcessingJob>({
  image,
  url,
  port,
  onCompleted,
  onChooseAnother,
}: ProcessingViewProps<Job>) {
  const [state, setState] = useState<ProcessingState<Job>>({ status: 'starting' });
  const [attempt, setAttempt] = useState(0);
  const title = useRef<HTMLHeadingElement>(null);
  const completed = useRef(onCompleted);
  const failure = state.status === 'failed' ? FAILURE_COPY[state.reason] : null;
  const message = failure ? FAILED_TITLE : PROCESSING_MESSAGE;

  useEffect(() => {
    completed.current = onCompleted;
  }, [onCompleted]);

  // 누른 버튼이 사라지므로(처리하기 · 다시 시도) 포커스를 제목으로 옮긴다.
  useEffect(() => {
    title.current?.focus();
  }, [attempt]);

  // 지금 시도. 개발 모드의 effect 재실행(마운트 → 정리 → 마운트)에서 요청을 두 번 보내지 않도록
  // 같은 시도는 다시 시작하지 않고, 화면에 붙어 있는 동안(mounted)만 알린다.
  const run = useRef<{ port: unknown; image: File; attempt: number } | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const current = run.current;
    if (current?.port !== port || current.image !== image || current.attempt !== attempt) {
      const mine = { port, image, attempt };
      run.current = mine;
      const onChange = (next: ProcessingState<Job>) => {
        if (next.status === 'completed') completed.current(next.job);
        else setState(next);
      };
      void runProcessing(port, image, onChange, () => !mounted.current || run.current !== mine);
    }
    return () => {
      mounted.current = false;
    };
  }, [port, image, attempt]);

  return (
    <div className="flex flex-col gap-6">
      <h1 ref={title} tabIndex={-1} className="text-center typo-heading-h4">
        {message}
      </h1>
      <div className="relative">
        <SelectedImage url={url} />
        {!failure && <ScanOverlay />}
      </div>
      {!failure && <ProcessingBar />}

      {/* 항상 있는 live region 하나에 문장만 바꿔야 스크린 리더가 놓치지 않는다. 실패는 alert가 알린다. */}
      <p role="status" className="sr-only">
        {failure ? '' : message}
      </p>
      {failure && (
        <div className="flex flex-col gap-4">
          <p role="alert" className="text-center typo-paragraph-default">
            {failure.message}
          </p>
          <div className="flex flex-col gap-2">
            {failure.retry && (
              <Button
                type="button"
                variant="contained"
                size="lg"
                fullWidth
                onClick={() => setAttempt((count) => count + 1)}
              >
                다시 시도
              </Button>
            )}
            <Button
              type="button"
              variant={failure.retry ? 'text' : 'contained'}
              size={failure.retry ? 'md' : 'lg'}
              fullWidth
              onClick={onChooseAnother}
            >
              다른 사진 선택
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
