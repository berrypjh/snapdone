'use client';

import { useState, useTransition } from 'react';

import { Button } from '@berrypjh/react-ui';
import { IMAGE_TYPE_LABEL, type ImageType, type JobDetail } from '@snapdone/processing';

import { chooseImageType, type DetailResponse } from '@/lib/processing-jobs/actions';

import { CHOOSE_FAILED, CHOOSE_FAILED_DEFAULT, chooseType } from './result-copy';

type TypeChoiceProps = {
  jobId: string;
  candidates: readonly ImageType[];
  /** 이 처리 흐름이 들고 있는 원본. 서버가 원래 작업과 같은 사진인지 확인한다. */
  file: File;
  onStarted: (job: JobDetail) => void;
  onSignedOut: () => void;
};

/** 유형을 정하지 못한 사진을 고른 유형으로 이어서 처리한다. 사진을 다시 고르지 않는다. */
export function TypeChoice({ jobId, candidates, file, onStarted, onSignedOut }: TypeChoiceProps) {
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState<string | null>(null);

  const choose = (imageType: ImageType) =>
    startTransition(async () => {
      const form = new FormData();
      form.append('image', file);
      form.append('sourceJobId', jobId);
      form.append('imageType', imageType);
      const response: DetailResponse = await chooseImageType(form).catch(() => ({
        type: 'error',
        code: 'network',
      }));
      if (response.type === 'job') return onStarted(response.job);
      if (response.type === 'signed-out') return onSignedOut();
      setFailed(response.code);
    });

  return (
    <div className="flex flex-col gap-2">
      {candidates.map((imageType) => (
        <Button
          key={imageType}
          type="button"
          variant="contained"
          size="lg"
          fullWidth
          disabled={pending}
          onClick={() => choose(imageType)}
        >
          {chooseType(IMAGE_TYPE_LABEL[imageType])}
        </Button>
      ))}
      {failed && (
        <p role="alert" className="typo-paragraph-default text-text-error">
          {CHOOSE_FAILED[failed] ?? CHOOSE_FAILED_DEFAULT}
        </p>
      )}
    </div>
  );
}
