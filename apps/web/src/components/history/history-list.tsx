'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { unstable_rethrow, useRouter } from 'next/navigation';

import { Button, Checkbox } from '@berrypjh/react-ui';
import { formatKoreanTime, summarizeJob } from '@snapdone/processing';
import { Trash2 } from 'lucide-react';

import { deleteRecords } from '@/lib/processing-jobs/actions';
import type { DayGroup } from '@/lib/processing-jobs/days';

import { RecentJobs } from '../recent-jobs';

import {
  CANCEL,
  confirmDelete,
  DELETE_FAILED,
  DELETE_YES,
  deletedCount,
  deleteSelected,
  SELECT,
  selectAll,
  selectedCount,
} from './history-copy';

/**
 * 날짜로 묶은 기록과 그 제목 줄. 평소에는 항목을 누르면 그 결과로 가고, "선택"을 누르면 체크해 여러 개를 한 번에 지운다.
 * 지우기는 되돌릴 수 없어 한 번 더 확인받고, 지운 뒤에는 서버에서 목록을 다시 읽는다.
 */
export function HistoryList({ title, groups }: { title: string; groups: DayGroup[] }) {
  const router = useRouter();
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [pending, startDeleting] = useTransition();
  const question = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (confirming) question.current?.focus();
  }, [confirming]);

  const stop = () => {
    setSelecting(false);
    setSelected(new Set());
    setConfirming(false);
    setFailed(false);
  };

  const toggle = (ids: readonly string[], on: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  const remove = () =>
    startDeleting(async () => {
      let result: Awaited<ReturnType<typeof deleteRecords>>;
      try {
        result = await deleteRecords([...selected]);
      } catch (error) {
        // 로그인 만료는 redirect로 온다. 그 밖의 거절(연결 끊김)은 실패다.
        unstable_rethrow(error);
        setFailed(true);
        return;
      }
      if (result.type === 'error') {
        setFailed(true);
        return;
      }
      stop();
      setMessage(deletedCount(result.count));
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex min-h-11 items-center gap-3">
        <h1 className="mr-auto typo-heading-h4">{title}</h1>
        {selecting && (
          <span className="typo-caption-default text-text-light">
            {selectedCount(selected.size)}
          </span>
        )}
        <Button
          type="button"
          variant="text"
          size="sm"
          disabled={pending}
          onClick={() => {
            setMessage('');
            if (selecting) stop();
            else setSelecting(true);
          }}
        >
          {selecting ? CANCEL : SELECT}
        </Button>
      </div>
      <p role="status" className="typo-paragraph-default empty:sr-only">
        {message}
      </p>

      {groups.map((group) => {
        const ids = group.jobs.map((job) => job.jobId);
        const all = ids.every((id) => selected.has(id));
        return (
          <section key={group.label} aria-label={group.label} className="flex flex-col gap-2">
            {selecting ? (
              <Checkbox
                checked={all}
                onChange={(event) => toggle(ids, event.target.checked)}
                disabled={pending}
                className="min-h-11"
              >
                <span className="typo-caption-default text-text-light">
                  {selectAll(group.label)}
                </span>
              </Checkbox>
            ) : (
              <h2 className="typo-caption-default text-text-light">{group.label}</h2>
            )}
            {selecting ? (
              <ul className="flex flex-col">
                {group.jobs.map((job) => {
                  const { headline, status } = summarizeJob(job);
                  return (
                    <li
                      key={job.jobId}
                      className="border-t border-stroke-light py-2 first:border-t-0 first:pt-0"
                    >
                      <Checkbox
                        checked={selected.has(job.jobId)}
                        onChange={(event) => toggle([job.jobId], event.target.checked)}
                        disabled={pending}
                        className="min-h-11"
                      >
                        <span className="flex flex-wrap items-baseline gap-x-2">
                          <span className="typo-body-medium-strong">{headline ?? status}</span>
                          <span className="typo-caption-default text-text-light">
                            {formatKoreanTime(job.createdAt)}
                          </span>
                        </span>
                      </Checkbox>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <RecentJobs jobs={group.jobs} timeOnly />
            )}
          </section>
        );
      })}

      {selecting && (
        // 고르는 동안 늘 보이도록 화면 아래에 붙인다. 폰 폭에서는 하단 탭(min-h-14) 바로 위다.
        <div className="sticky bottom-14 flex flex-col gap-3 border-t border-stroke-light bg-background-surface py-4 md:bottom-0">
          {confirming ? (
            <>
              <p ref={question} tabIndex={-1} className="typo-paragraph-default">
                {confirmDelete(selected.size)}
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
                  onClick={remove}
                >
                  {DELETE_YES}
                </Button>
                <Button
                  type="button"
                  variant="text"
                  disabled={pending}
                  onClick={() => setConfirming(false)}
                >
                  {CANCEL}
                </Button>
              </div>
            </>
          ) : (
            <Button
              type="button"
              variant="contained"
              size="lg"
              fullWidth
              disabled={selected.size === 0}
              startIcon={<Trash2 aria-hidden size={18} />}
              onClick={() => setConfirming(true)}
            >
              {deleteSelected(selected.size)}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
