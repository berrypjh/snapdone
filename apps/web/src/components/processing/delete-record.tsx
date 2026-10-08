'use client';

import { startTransition, useActionState, useEffect, useRef, useState } from 'react';
import { unstable_rethrow } from 'next/navigation';

import { Button } from '@berrypjh/react-ui';
import { Trash2 } from 'lucide-react';

import { deleteRecord } from '@/lib/processing-jobs/actions';

import { DELETE, DELETE_CANCEL, DELETE_CONFIRM, DELETE_FAILED, DELETE_YES } from './result-copy';

/**
 * 삭제 Action을 부른다. 성공 · 로그인 만료는 redirect로 끝나고, 그 redirect는 Action 호출의 거절로 오므로
 * router에 다시 던진다. 그 밖의 거절(연결 끊김)과 돌아온 값은 실패다.
 */
const remove = async (jobId: string): Promise<{ failed: boolean }> => {
  try {
    return { failed: (await deleteRecord(jobId)).type === 'error' };
  } catch (error) {
    unstable_rethrow(error);
    return { failed: true };
  }
};

/**
 * 기록 하나 삭제. 되돌릴 수 없으므로 누르면 그 자리에서 한 번 더 확인받는다(제품 원칙: 되돌리기 또는 사전 확인).
 * 확인을 열면 확인 문장으로, 취소하면 삭제 버튼으로 포커스를 돌려준다.
 */
export function DeleteRecord({ jobId }: { jobId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [{ failed }, run, pending] = useActionState(() => remove(jobId), { failed: false });
  const question = useRef<HTMLParagraphElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const opened = useRef(false);

  useEffect(() => {
    if (confirming) question.current?.focus();
    else if (opened.current) opener.current?.focus();
    opened.current = confirming;
  }, [confirming]);

  if (!confirming) {
    return (
      <Button
        ref={opener}
        type="button"
        variant="outlined"
        fullWidth
        startIcon={<Trash2 aria-hidden size={18} />}
        onClick={() => setConfirming(true)}
      >
        {DELETE}
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-stroke-light p-4">
      <p ref={question} tabIndex={-1} className="typo-paragraph-default">
        {DELETE_CONFIRM}
      </p>
      {failed && !pending && (
        <p role="alert" className="typo-caption-default text-text-error">
          {DELETE_FAILED}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="contained"
          loading={pending}
          disabled={pending}
          onClick={() => startTransition(run)}
        >
          {DELETE_YES}
        </Button>
        <Button
          type="button"
          variant="text"
          disabled={pending}
          onClick={() => setConfirming(false)}
        >
          {DELETE_CANCEL}
        </Button>
      </div>
    </div>
  );
}
