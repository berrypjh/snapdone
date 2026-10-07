'use client';

import { type ChangeEvent, type DragEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@berrypjh/react-ui';
import { isProcessed, type JobDetail } from '@snapdone/processing';

import { loginPage } from '@/lib/auth/redirect';
import { checkPhoto, PHOTO_ACCEPT, type PhotoCheck, useObjectUrl } from '@/lib/photo';
import { createJobPort } from '@/lib/processing-jobs/port';

import { ProcessingView } from '../onboarding/processing-view';
import { SelectedImage } from '../onboarding/selected-image';

import {
  CHOOSE,
  CHOOSE_ANOTHER,
  CHOOSE_NOTE,
  CHOOSE_TITLE,
  DROP_HINT,
  FORMAT_NOTE,
  INVALID_PHOTO,
  PATH,
  PREVIEW_NOTE,
  PREVIEW_TITLE,
  PROCESS,
  PROCESS_ANOTHER,
} from './photo-flow-copy';
import { ProcessingResult } from './processing-result';
import { ReprocessPanel } from './reprocess-panel';

type Step = 'choose' | 'preview' | 'processing' | 'result';
type Invalid = Extract<PhotoCheck, { type: 'invalid' }>['reason'];

/**
 * 사진 추가 → 확인 → 처리 → 결과. 사진은 이 브라우저 화면에만 있고 저장하지 않는다 — 새로고침하면 처음으로 돌아온다.
 * 처리는 온보딩 첫 사진과 같은 처리 화면(`ProcessingView`)을, 결과는 처리 결과 화면(`ProcessingResult`)을 쓴다.
 * 결과 화면도 같은 원본(`File` · blob 주소)을 써서, 유형을 고를 때 사진을 다시 고르지 않는다.
 */
export function PhotoFlow() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const [image, setImage] = useState<File | null>(null);
  const [step, setStep] = useState<Step>('choose');
  const [job, setJob] = useState<JobDetail | null>(null);
  const [invalid, setInvalid] = useState<Invalid | null>(null);
  const [dragging, setDragging] = useState(false);
  const url = useObjectUrl(image);
  const [port] = useState(() => createJobPort(() => router.replace(loginPage(PATH))));

  // 사진을 고르면 누른 버튼이 사라지므로 포커스를 확인 화면의 제목으로 옮긴다.
  useEffect(() => {
    if (step === 'preview') title.current?.focus();
  }, [step, image]);

  const choose = () => input.current?.click();

  /** 고른 파일을 받는다. 고르지 않았으면(취소) 아무것도 바꾸지 않고, 맞지 않는 파일이면 지금 사진을 그대로 둔다. */
  const accept = (files: readonly File[]) => {
    const checked = checkPhoto(files);
    if (checked.type === 'none') return;
    if (checked.type === 'invalid') return setInvalid(checked.reason);
    setInvalid(null);
    setImage(checked.file);
    setJob(null);
    setStep('preview');
  };

  const onSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    // 같은 파일을 다시 골라도 change가 오도록 비운다.
    event.target.value = '';
    accept(files);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    accept([...event.dataTransfer.files]);
  };

  const picker = (
    <input ref={input} type="file" accept={PHOTO_ACCEPT} hidden onChange={onSelected} />
  );
  const invalidAlert = invalid && (
    <p role="alert" className="text-center typo-paragraph-default text-text-error">
      {INVALID_PHOTO[invalid]}
    </p>
  );

  if (step === 'result' && job && image && url) {
    return (
      <div className="flex flex-col gap-6">
        {picker}
        <ProcessingResult
          key={job.jobId}
          initial={job}
          image={{ url, file: image }}
          returnTo={PATH}
          focusOnOpen
        />
        {/* 결과 밖에 두어, 다시 처리해 결과가 바뀌어도 기본값 저장 상태가 남는다. */}
        {isProcessed(job) && (
          <ReprocessPanel job={job} file={image} onReprocessed={setJob} returnTo={PATH} />
        )}
        {invalidAlert}
        <Button type="button" variant="outlined" size="lg" fullWidth onClick={choose}>
          {PROCESS_ANOTHER}
        </Button>
      </div>
    );
  }

  if (step === 'processing' && image && url) {
    return (
      <>
        {picker}
        <ProcessingView
          image={image}
          url={url}
          port={port}
          onCompleted={(completed) => {
            setJob(completed);
            setStep('result');
          }}
          onChooseAnother={choose}
        />
        {invalidAlert}
      </>
    );
  }

  if (step === 'preview' && url) {
    return (
      <div className="flex flex-col gap-6">
        {picker}
        <h1 ref={title} tabIndex={-1} className="text-center typo-heading-h4">
          {PREVIEW_TITLE}
        </h1>
        <SelectedImage url={url} />
        <p className="text-center typo-paragraph-default text-text-light">{PREVIEW_NOTE}</p>
        {invalidAlert}
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="contained"
            size="lg"
            fullWidth
            onClick={() => setStep('processing')}
          >
            {PROCESS}
          </Button>
          <Button type="button" variant="text" fullWidth className="min-h-11" onClick={choose}>
            {CHOOSE_ANOTHER}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {picker}
      <div className="text-center">
        <h1 className="typo-heading-h4">{CHOOSE_TITLE}</h1>
        <p className="mt-2 typo-paragraph-default text-text-light">{CHOOSE_NOTE}</p>
      </div>
      {/* 끌어 놓기는 마우스 사용자를 위한 덧붙임이다. 키보드 사용자는 아래 버튼으로 같은 일을 한다. */}
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center gap-4 rounded-lg border border-dashed p-6 text-center ${dragging ? 'border-stroke-primary' : 'border-stroke-light'}`}
      >
        <p className="typo-paragraph-default">{DROP_HINT}</p>
        <Button type="button" variant="contained" size="lg" fullWidth onClick={choose}>
          {CHOOSE}
        </Button>
        <p className="typo-caption-default text-text-light">{FORMAT_NOTE}</p>
      </div>
      {invalidAlert}
    </div>
  );
}
