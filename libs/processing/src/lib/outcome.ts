import {
  isReceiptAction,
  isTextAction,
  type ProcessingPreferences,
  type ReceiptAction,
  type TextAction,
} from './preferences';
import { isRecord } from './record';

/** 제품이 처리하는 사진 유형. Go `processing.ImageType` · 처리 방식 경로의 `imageType`과 같다. */
export type ImageType = keyof ProcessingPreferences;

export const IMAGE_TYPES = ['text', 'receipt'] as const satisfies readonly ImageType[];

const isImageType = (value: unknown): value is ImageType =>
  IMAGE_TYPES.some((type) => type === value);

/** 유형에 있는 처리 방식인가. 처리 방식 값은 처리 설정과 같다. */
export const isActionFor = (imageType: ImageType, action: unknown): boolean =>
  imageType === 'text' ? isTextAction(action) : isReceiptAction(action);

/**
 * 서버가 작업에 적용한 사진 유형과 처리 방식(Go `processing.Selection`). 작업을 만들 때 저장돼 있던 처리 방식에서 골랐다.
 * 화면은 지금 처리 방식을 다시 읽어 짐작하지 않고 이 값을 쓴다.
 */
export type ProcessingSelection =
  | { imageType: 'text'; appliedAction: TextAction }
  | { imageType: 'receipt'; appliedAction: ReceiptAction };

/** Go 응답의 `selection`을 읽는다. 유형에 없는 처리 방식이면 `null`이다. */
export const parseSelection = (value: unknown): ProcessingSelection | null => {
  if (!isRecord(value) || !hasExactly(value, ['imageType', 'appliedAction'])) return null;
  const { imageType, appliedAction } = value;
  if (imageType === 'text' && isTextAction(appliedAction)) return { imageType, appliedAction };
  if (imageType === 'receipt' && isReceiptAction(appliedAction))
    return { imageType, appliedAction };
  return null;
};

/**
 * 영수증 필드 하나. `value`가 `null`이면 사진에서 확인하지 못한 값이다.
 * `resolved`가 아니면 확인이 필요하다 — `value`가 있으면 `candidates` 중 하나다. 후보는 없을 수 있다.
 */
export type ReceiptField = {
  value: string | null;
  candidates: readonly string[];
  resolved: boolean;
};

/**
 * 영수증의 지출 정보. 사진에서 읽은 값까지만 담는다(Go `processing.Expense`).
 * `date`는 YYYY-MM-DD, `total`은 소수점 문자열(예: `"12000"`, `"12.50"` — 숫자로 바꾸지 않는다),
 * `currency`는 ISO 4217 코드(예: `"KRW"`)이고, `merchant` · `paymentMethod`는 사진에 쓰인 그대로다.
 */
export type Expense = {
  merchant: ReceiptField;
  date: ReceiptField;
  total: ReceiptField;
  currency: ReceiptField;
  paymentMethod: ReceiptField;
};

/** 번역. 원문이 이미 한국어라 번역할 것이 없으면 `needed: false`이고 번역문이 없다. */
export type Translation = { needed: true; text: string } | { needed: false; text: null };

type OutputValues = {
  original: string;
  translation: Translation;
  summary: string;
  expense: Expense;
};
type OutputKey = keyof OutputValues;

/** 처리 방식마다 결과에 있는 필드. Go `outputFields`와 같은 짝 · 같은 순서다. */
const OUTPUT_FIELDS = {
  text: {
    extract_and_translate: ['original', 'translation'],
    extract_text: ['original'],
    summarize: ['summary'],
    extract_and_summarize: ['original', 'summary'],
  },
  receipt: {
    record_expense: ['expense'],
    extract_text: ['original'],
    summarize: ['summary'],
  },
} as const satisfies {
  text: Record<TextAction, readonly OutputKey[]>;
  receipt: Record<ReceiptAction, readonly OutputKey[]>;
};

type Fields = typeof OUTPUT_FIELDS;
type OutputOf<K> = K extends readonly OutputKey[] ? { [P in K[number]]: OutputValues[P] } : never;
type Processed<T extends ImageType> = {
  [A in keyof Fields[T]]: {
    kind: 'processed';
    imageType: T;
    appliedAction: A;
    output: OutputOf<Fields[T][A]>;
  };
}[keyof Fields[T]];

/** 처리한 사진. 적용한 처리 방식에 따라 결과 필드가 정해진다. */
export type ProcessedOutcome = Processed<'text'> | Processed<'receipt'>;

/**
 * 제품 처리 결과(Go `processing.Outcome`). 처리함 · 지원하지 않는 사진 · 유형을 정하지 못함(사용자가 고른다)이다.
 * 분류 결과(`ProcessingResult`)와 따로 온다.
 */
export type ProcessingOutcome =
  | ProcessedOutcome
  | { kind: 'unsupported' }
  | { kind: 'ambiguous'; candidates: readonly ImageType[] };

const hasExactly = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).length === keys.length && keys.every((key) => key in value);

const isText = (value: unknown): value is string => typeof value === 'string' && value !== '';

const isDistinct = (values: readonly unknown[]) => new Set(values).size === values.length;

type Format = (value: unknown) => value is string;

const AMOUNT = /^(0|[1-9][0-9]*)(\.[0-9]+)?$/;
const CURRENCY = /^[A-Z]{3}$/;
const DATE = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/;

const isAmount: Format = (value): value is string =>
  typeof value === 'string' && AMOUNT.test(value);
const isCurrency: Format = (value): value is string =>
  typeof value === 'string' && CURRENCY.test(value);

/** 실제로 있는 날짜인가. 2월 30일 같은 날짜는 거절한다(Go `time.Parse`와 같다). */
const isDate: Format = (value): value is string => {
  const match = typeof value === 'string' ? DATE.exec(value) : null;
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
};

/** 값과 후보는 모두 그 필드의 형식이어야 한다(Go `ReceiptField.valid`). */
const parseField = (value: unknown, format: Format): ReceiptField | null => {
  if (!isRecord(value) || !hasExactly(value, ['value', 'candidates', 'resolved'])) return null;
  const { candidates, resolved } = value;
  const current = value.value;
  if (!Array.isArray(candidates) || !candidates.every(format) || !isDistinct(candidates)) {
    return null;
  }
  if (typeof resolved !== 'boolean' || (current !== null && !format(current))) return null;
  if (current === null ? resolved : !resolved && !candidates.includes(current)) return null;
  return { value: current, candidates: [...candidates], resolved };
};

const EXPENSE_FORMATS: Record<keyof Expense, Format> = {
  merchant: isText,
  date: isDate,
  total: isAmount,
  currency: isCurrency,
  paymentMethod: isText,
};

const parseExpense = (value: unknown): Expense | null => {
  if (!isRecord(value) || !hasExactly(value, Object.keys(EXPENSE_FORMATS))) return null;
  const merchant = parseField(value.merchant, EXPENSE_FORMATS.merchant);
  const date = parseField(value.date, EXPENSE_FORMATS.date);
  const total = parseField(value.total, EXPENSE_FORMATS.total);
  const currency = parseField(value.currency, EXPENSE_FORMATS.currency);
  const paymentMethod = parseField(value.paymentMethod, EXPENSE_FORMATS.paymentMethod);
  return merchant && date && total && currency && paymentMethod
    ? { merchant, date, total, currency, paymentMethod }
    : null;
};

const parseTranslation = (value: unknown): Translation | null => {
  if (!isRecord(value) || !hasExactly(value, ['needed', 'text'])) return null;
  if (value.needed === true && isText(value.text)) return { needed: true, text: value.text };
  if (value.needed === false && value.text === null) return { needed: false, text: null };
  return null;
};

const outputFields = (imageType: ImageType, action: unknown): readonly OutputKey[] | null => {
  if (imageType === 'text') return isTextAction(action) ? OUTPUT_FIELDS.text[action] : null;
  return isReceiptAction(action) ? OUTPUT_FIELDS.receipt[action] : null;
};

const parseOutput = (keys: readonly OutputKey[], value: unknown) => {
  if (!isRecord(value) || !hasExactly(value, keys)) return null;
  const output: Partial<OutputValues> = {};
  for (const key of keys) {
    if (key === 'expense') {
      const expense = parseExpense(value.expense);
      if (!expense) return null;
      output.expense = expense;
    } else if (key === 'translation') {
      const translation = parseTranslation(value.translation);
      if (!translation) return null;
      output.translation = translation;
    } else {
      const text = value[key];
      if (!isText(text)) return null;
      output[key] = text;
    }
  }
  return output;
};

const parseProcessed = (value: Record<string, unknown>): ProcessedOutcome | null => {
  if (!hasExactly(value, ['kind', 'imageType', 'appliedAction', 'output'])) return null;
  const { imageType, appliedAction } = value;
  if (!isImageType(imageType)) return null;
  const keys = outputFields(imageType, appliedAction);
  const output = keys && parseOutput(keys, value.output);
  // 짝과 필드를 위에서 확인했다. 값이 계약의 한 갈래와 같은 모양이다.
  return output
    ? ({ kind: 'processed', imageType, appliedAction, output } as ProcessedOutcome)
    : null;
};

/**
 * Go 응답의 `outcome`을 읽는다. 계약 밖이면 `null`이다 — 고쳐 읽거나 기본값을 넣지 않는다.
 * 이 계약 전에 만든 작업에는 `outcome`이 없다. 그 경우는 부르는 쪽이 따로 다룬다.
 */
export const parseOutcome = (value: unknown): ProcessingOutcome | null => {
  if (!isRecord(value)) return null;
  switch (value.kind) {
    case 'processed':
      return parseProcessed(value);
    case 'unsupported':
      return hasExactly(value, ['kind']) ? { kind: 'unsupported' } : null;
    case 'ambiguous': {
      const { candidates } = value;
      if (!hasExactly(value, ['kind', 'candidates']) || !Array.isArray(candidates)) return null;
      return candidates.length > 0 && candidates.every(isImageType) && isDistinct(candidates)
        ? { kind: 'ambiguous', candidates: [...candidates] }
        : null;
    }
    default:
      return null;
  }
};
