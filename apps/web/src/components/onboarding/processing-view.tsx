'use client';

import { useEffect, useRef, useState } from 'react';

import { Button } from '@berrypjh/react-ui';
import {
  type ProcessingPort,
  type ProcessingResult,
  type ProcessingState,
  runProcessing,
} from '@snapdone/onboarding';

import { FAILED_TITLE, FAILURE_COPY, PROCESSING_MESSAGE } from './processing-copy';
import { SelectedImage } from './selected-image';

type ProcessingViewProps = {
  image: File;
  url: string;
  port: ProcessingPort<File>;
  onCompleted: (result: ProcessingResult) => void;
  onChooseAnother: () => void;
};

/**
 * ON-05 첫 처리. 사진을 보내고 작업이 끝날 때까지 기다린다.
 * 서버가 알려주는 것은 처리 중 · 완료 · 실패뿐이라 중간 단계를 지어내지 않는다. 화면을 떠나면 조회를 멈춘다.
 * 완료되면 결과를 `onCompleted`로 넘기고, 결과 화면(ON-06)은 부모가 연다. mobile 처리 화면과 같은 경계다.
 */
export function ProcessingView({
  image,
  url,
  port,
  onCompleted,
  onChooseAnother,
}: ProcessingViewProps) {
  const [state, setState] = useState<ProcessingState>({ status: 'starting' });
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

  useEffect(() => {
    let stopped = false;
    const onChange = (next: ProcessingState) => {
      if (next.status === 'completed') completed.current(next.result);
      else setState(next);
    };
    void runProcessing(port, image, onChange, () => stopped);
    return () => {
      stopped = true;
    };
  }, [port, image, attempt]);

  return (
    <div className="flex flex-col gap-6">
      <h1 ref={title} tabIndex={-1} className="text-center typo-heading-h4">
        {message}
      </h1>
      <SelectedImage url={url} />

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
