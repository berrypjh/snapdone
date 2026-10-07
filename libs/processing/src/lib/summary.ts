import { actionLabel, IMAGE_TYPE_LABEL } from './preferences';
import { kindLabel, type RecentJob } from './recent-jobs';
import { needsReview, presentJob } from './result';

/**
 * 최근 처리 한 건을 목록 한 줄로 줄인 것. web 홈 · 기록과 mobile 홈이 같은 말을 쓴다.
 * `headline`은 서버가 적용한 유형 · 처리 방식이거나 처리하지 못한 이유, `preview`는 서버 결과의 앞부분이다.
 * 결과 계약 전에 만든 작업은 사진에서 찾은 값(`facts`)만 있다.
 */
export type JobSummary = {
  headline: string | null;
  status: string;
  preview: string | null;
  facts: readonly { label: string; value: string }[];
  /** 영수증에 확인이 필요한 값이 있다. 기록 화면에서 그 필드를 확정할 수 있다. */
  needsCheck: boolean;
};

const STATUS = {
  running: '처리 중',
  failed: '처리하지 못함',
  done: '처리 완료',
  skipped: '처리하지 않음',
};

export const summarizeJob = (job: RecentJob): JobSummary => {
  const screen = presentJob(job);
  const empty = { preview: null, facts: [], needsCheck: false };
  switch (screen.kind) {
    case 'running':
      return { headline: null, status: STATUS.running, ...empty };
    case 'failed':
      return { headline: null, status: STATUS.failed, ...empty };
    case 'unsupported':
      return { headline: '지원하지 않는 사진', status: STATUS.skipped, ...empty };
    case 'ambiguous':
      return { headline: '유형을 정하지 못한 사진', status: STATUS.skipped, ...empty };
    case 'without-outcome':
      return { ...empty, headline: kindLabel(job), status: STATUS.done, facts: screen.facts };
    case 'processed': {
      const { imageType, appliedAction } = screen.applied;
      const text =
        screen.texts.find((block) => block.kind === 'summary') ??
        screen.texts.find((block) => block.kind === 'translation') ??
        screen.texts[0];
      const expense = screen.expense
        ?.filter((field) => (field.name === 'merchant' || field.name === 'total') && field.value)
        .map((field) => field.value)
        .join(' · ');
      return {
        headline: `${IMAGE_TYPE_LABEL[imageType]} · ${actionLabel(imageType, appliedAction) ?? ''}`,
        status: STATUS.done,
        preview: text?.text ?? (expense || null),
        facts: [],
        needsCheck: needsReview(screen),
      };
    }
  }
};

/** 확인이 필요한 처리. 홈의 "확인이 필요한 처리"가 실제 결과로만 채운다. */
export const needsCheck = (job: RecentJob): boolean => summarizeJob(job).needsCheck;
