'use client';

import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@berrypjh/react-ui';
import type { ProcessingResult } from '@snapdone/onboarding';

import { loginPage } from '@/lib/auth/redirect';
import { createProcessingPort } from '@/lib/onboarding/processing-port';

import { ProcessingView } from './processing-view';
import { ResultView } from './result-view';
import { SelectedImage } from './selected-image';

/** Go가 내용으로 판별해 받는 형식. 파일 선택 창에서 먼저 거른다. */
const ACCEPT = 'image/jpeg,image/png,image/gif,image/webp';
const EXAMPLES = ['영수증', '외국어가 있는 사진'] as const;

type Step = 'choose' | 'preview' | 'processing' | 'result';

/** 고른 파일의 blob 주소. 파일이 바뀌거나 화면을 떠나면 해제한다. */
const useObjectUrl = (file: File | null) => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) return;
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return file ? url : null;
};

/**
 * ON-04 첫 사진 → 사진 확인 → ON-05 처리 → ON-06 결과. mobile의 첫 사진 · 확인 · 처리 · 결과 화면과 같은 순서다.
 * 사진은 브라우저에만 있고 저장하지 않는다 — 새로고침하면 첫 사진 단계로 돌아온다. 결과 화면도 같은 blob 주소를 쓴다.
 */
export function FirstImageFlow() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<File | null>(null);
  const [step, setStep] = useState<Step>('choose');
  const [result, setResult] = useState<ProcessingResult | null>(null);
  const url = useObjectUrl(image);
  const [port] = useState(() =>
    createProcessingPort(() => router.replace(loginPage('/onboarding'))),
  );

  const title = useRef<HTMLHeadingElement>(null);

  // 사진을 고르면 누른 버튼이 사라지므로 포커스를 확인 화면의 제목으로 옮긴다.
  useEffect(() => {
    if (step === 'preview') title.current?.focus();
  }, [step, image]);

  const choose = () => input.current?.click();

  const onSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // 같은 파일을 다시 골라도 change가 오도록 비운다.
    event.target.value = '';
    if (!file) return;
    setImage(file);
    setStep('preview');
  };

  const picker = <input ref={input} type="file" accept={ACCEPT} hidden onChange={onSelected} />;

  const onCompleted = (completed: ProcessingResult) => {
    setResult(completed);
    setStep('result');
  };

  if (step === 'result' && result && url) return <ResultView url={url} result={result} />;

  if (step === 'processing' && image && url) {
    return (
      <>
        {picker}
        <ProcessingView
          image={image}
          url={url}
          port={port}
          onCompleted={onCompleted}
          onChooseAnother={choose}
        />
      </>
    );
  }

  if (step === 'preview' && url) {
    return (
      <div className="flex flex-col gap-6">
        {picker}
        <h1 ref={title} tabIndex={-1} className="text-center typo-heading-h4">
          사진을 처리할까요?
        </h1>
        <SelectedImage url={url} />
        <p className="text-center typo-paragraph-default text-text-light">
          사진 속 내용을 확인하고 필요한 작업을 찾아 드립니다.
        </p>
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="contained"
            size="lg"
            fullWidth
            onClick={() => setStep('processing')}
          >
            처리하기
          </Button>
          <Button type="button" variant="text" fullWidth onClick={choose}>
            다른 사진 선택
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {picker}
      <div className="text-center">
        <h1 className="typo-heading-h4">
          첫 번째 사진을
          <br />
          처리해볼까요?
        </h1>
        <p className="mt-2 typo-caption-default text-text-light">
          영수증이나 외국어가 있는 사진을 올려 보세요.
        </p>
      </div>
      <Button type="button" variant="contained" size="lg" fullWidth onClick={choose}>
        사진 선택
      </Button>
      <p className="text-center typo-caption-default text-text-light">
        <span className="sr-only">추천: </span>
        {EXAMPLES.join(' · ')}
      </p>
    </div>
  );
}
