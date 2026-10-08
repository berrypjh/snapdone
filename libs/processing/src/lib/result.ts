import { formatAmount, formatDate } from './format';
import type {
  Expense,
  ImageType,
  ProcessedOutcome,
  ProcessingSelection,
  ReceiptField,
} from './outcome';
import type { JobDetail } from './recent-jobs';

/** 지출 정보 필드. 화면 순서다. */
export const EXPENSE_FIELDS = ['merchant', 'date', 'total', 'currency', 'paymentMethod'] as const;
export type ExpenseFieldName = (typeof EXPENSE_FIELDS)[number];

/** 확정함 · 값은 있지만 확인이 필요함 · 확인하지 못함. */
export type FieldState = 'resolved' | 'uncertain' | 'unresolved';

/** 필드 하나의 화면 값. `value`는 화면 형식이고, 후보는 보낼 값(`value`)과 화면 형식(`label`)을 함께 가진다. */
export type FieldView = {
  name: ExpenseFieldName;
  state: FieldState;
  value: string | null;
  candidates: readonly { value: string; label: string }[];
};

/** 서버가 준 글. 원문 · 번역 · 요약을 섞지 않는다. */
export type TextBlock = { kind: 'original' | 'translation' | 'summary'; text: string };

/**
 * 결과 화면이 보일 것. 서버 작업 상태와 제품 결과만 따르고, 서버가 주지 않은 값은 만들지 않는다.
 * `processed`만 처리를 마친 화면이다 — unsupported · ambiguous · 처리 중 · 실패는 완료로 보이지 않는다.
 * `without-outcome`은 처리 결과 없이 끝난 이전 작업이라 사진에서 찾은 값만 있다.
 */
export type ResultScreen =
  | { kind: 'running' }
  | { kind: 'failed' }
  | { kind: 'unsupported' }
  | { kind: 'ambiguous'; candidates: readonly ImageType[] }
  | { kind: 'without-outcome'; facts: readonly { label: string; value: string }[] }
  | {
      kind: 'processed';
      /** 서버가 이 작업에 적용한 유형과 처리 방식. */
      applied: ProcessingSelection;
      texts: readonly TextBlock[];
      /** 번역할 것이 없어 번역하지 않았다. 번역 처리 방식에만 의미가 있다. */
      translationSkipped: boolean;
      expense: readonly FieldView[] | null;
    };

const fieldState = (field: ReceiptField): FieldState => {
  if (field.resolved) return 'resolved';
  return field.value === null ? 'unresolved' : 'uncertain';
};

const displayValue = (name: ExpenseFieldName, value: string, expense: Expense): string => {
  if (name === 'date') return formatDate(value);
  if (name === 'total') {
    const currency = expense.currency.resolved ? expense.currency.value : null;
    return formatAmount(value, currency);
  }
  return value;
};

/** 지출 정보를 필드별 화면 값으로 바꾼다. 금액은 확정된 통화가 있을 때만 단위를 붙인다. */
export const presentExpense = (expense: Expense): FieldView[] =>
  EXPENSE_FIELDS.map((name) => {
    const field = expense[name];
    return {
      name,
      state: fieldState(field),
      value: field.value === null ? null : displayValue(name, field.value, expense),
      candidates: field.candidates.map((value) => ({
        value,
        label: displayValue(name, value, expense),
      })),
    };
  });

/** 결과 글. 사용자가 원한 일(요약 · 번역)을 먼저, 그 바탕인 원문을 마지막에 둔다. */
const textBlocks = (outcome: ProcessedOutcome): TextBlock[] => {
  const { output } = outcome;
  const blocks: TextBlock[] = [];
  if ('summary' in output) blocks.push({ kind: 'summary', text: output.summary });
  if ('translation' in output && output.translation.needed) {
    blocks.push({ kind: 'translation', text: output.translation.text });
  }
  if ('original' in output) blocks.push({ kind: 'original', text: output.original });
  return blocks;
};

const presentProcessed = (outcome: ProcessedOutcome): ResultScreen => {
  const { output } = outcome;
  const applied: ProcessingSelection =
    outcome.imageType === 'text'
      ? { imageType: 'text', appliedAction: outcome.appliedAction }
      : { imageType: 'receipt', appliedAction: outcome.appliedAction };
  return {
    kind: 'processed',
    applied,
    texts: textBlocks(outcome),
    translationSkipped: 'translation' in output && !output.translation.needed,
    expense: 'expense' in output ? presentExpense(output.expense) : null,
  };
};

/** 작업을 결과 화면의 내용으로 바꾼다. */
export const presentJob = (job: JobDetail): ResultScreen => {
  if (job.status === 'running') return { kind: 'running' };
  if (job.status === 'failed') return { kind: 'failed' };
  const { outcome } = job;
  if (!outcome) {
    // 서버가 읽은 값 그대로, 같은 순서로 복사한다. 화면이 작업을 바꾸지 못한다.
    const facts = job.result.facts.map(({ label, value }) => ({ label, value }));
    return { kind: 'without-outcome', facts };
  }
  if (outcome.kind === 'unsupported') return { kind: 'unsupported' };
  if (outcome.kind === 'ambiguous') return { kind: 'ambiguous', candidates: outcome.candidates };
  return presentProcessed(outcome);
};

/** 확인이 필요한 지출 정보 필드가 있는가. */
export const needsReview = (screen: ResultScreen): boolean =>
  screen.kind === 'processed' && !!screen.expense?.some((field) => field.state !== 'resolved');

/** 다시 처리한 작업이 처리를 마쳤는가. 처리를 마친 결과만 이전 결과를 바꾼다. */
export const isProcessed = (job: JobDetail): boolean =>
  job.status === 'completed' && job.outcome?.kind === 'processed';

/**
 * 다시 처리한 뒤 기본 처리 방식으로 저장할 것. 사용자가 "앞으로도 이 방식"을 고르고(`remember`) 새 작업이
 * 처리를 마쳤을 때만, 서버가 실제로 적용한 유형 · 처리 방식이다. 그 밖에는 `null` — 저장 요청을 보내지 않는다.
 */
export const preferenceToSave = (remember: boolean, job: JobDetail): ProcessingSelection | null =>
  remember && isProcessed(job) ? job.selection : null;
