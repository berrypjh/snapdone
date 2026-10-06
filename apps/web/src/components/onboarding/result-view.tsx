'use client';

import { startTransition, useActionState, useEffect, useRef } from 'react';
import { unstable_rethrow } from 'next/navigation';

import { Box, Button } from '@berrypjh/react-ui';
import { presentResult, type ProcessingResult } from '@snapdone/onboarding';

import { completeOnboarding } from '@/lib/onboarding/actions';

import { SelectedImage } from './selected-image';

type ResultViewProps = { url: string; result: ProcessingResult };

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
 * ON-06 첫 결과. 사진에서 확인한 것까지만 보이고, 추천 작업은 실행하지 않았다고 밝힌다.
 * 완료하면 서버가 온보딩을 끝내고 홈으로 보낸다. 실패해도 결과는 그대로 두고 다시 시도한다.
 */
export function ResultView({ url, result }: ResultViewProps) {
  const { kind, facts, suggestion, needsReview } = presentResult(result);
  const [{ failed }, complete, pending] = useActionState(finish, { failed: false });
  const title = useRef<HTMLHeadingElement>(null);

  // 처리 화면이 사라지므로 결과의 시작인 제목으로 포커스를 옮긴다.
  useEffect(() => {
    title.current?.focus();
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <h1 ref={title} tabIndex={-1} className="typo-heading-h4">
          사진을 확인했습니다
        </h1>
        {kind && <p className="mt-2 typo-caption-default text-text-light">{kind} 사진</p>}
      </div>
      <SelectedImage url={url} />

      <section aria-labelledby="result-facts" className="flex flex-col gap-3">
        <h2 id="result-facts" className="typo-body-medium-strong">
          사진에서 찾은 정보
        </h2>
        {facts.length > 0 ? (
          <Box p="lg" bg="background.surface" radius="lg" className="border border-stroke-light">
            <dl className="flex flex-col gap-3">
              {facts.map((fact, index) => (
                <div key={index} className="flex flex-col gap-1">
                  <dt className="typo-caption-default text-text-light">{fact.label}</dt>
                  <dd className="typo-paragraph-default">{fact.value}</dd>
                </div>
              ))}
            </dl>
          </Box>
        ) : (
          <p className="typo-paragraph-default text-text-light">사진에서 읽은 정보가 없습니다.</p>
        )}
        {needsReview && facts.length > 0 && (
          <p className="typo-caption-default text-text-light">
            일부 정보는 사진과 함께 확인해 주세요.
          </p>
        )}
      </section>

      {suggestion && (
        <section aria-labelledby="result-suggestion" className="flex flex-col gap-1">
          <h2 id="result-suggestion" className="typo-body-medium-strong">
            추천 작업
          </h2>
          <p className="typo-paragraph-default">{suggestion}</p>
          <p className="typo-caption-default text-text-light">
            아직 이 작업을 실행하지 않았습니다.
          </p>
        </section>
      )}

      <div className="flex flex-col gap-2">
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
