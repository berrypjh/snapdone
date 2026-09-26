import {
  ARTIFACT_SCHEMA_VERSION,
  AVAILABILITIES,
  type Availability,
  type CascadeTrace,
  type CaseChange,
  type CaseResult,
  type ClassificationQuality,
  type Comparison,
  type DatasetSelection,
  type ExpectedFact,
  type FieldStat,
  type Judgement,
  type LatencyStats,
  type Measure,
  type MetricDelta,
  type ModelTrace,
  type ObservedText,
  type RawObservation,
  type RetrievalTrace,
  type RunMetadata,
  type RunSummary,
  type Tally,
  type Task,
  TASKS,
  type TextQuality,
  type TranslationQuality,
  type TrialQuality,
  type Variant,
  type VariantReport,
} from './contract';

/**
 * 평가 산출물 v1을 `unknown`에서 읽는다. 필수 field가 없거나 모양이 다르면 경로를 담은
 * `ContractError`로 멈추고, 모르는 field는 무시한다(v1 안의 선택 field 추가를 받아들인다).
 */

export class ContractError extends Error {
  override name = 'ContractError';
}

/** 모양은 읽을 수 있지만 이 decoder가 모르는 `schemaVersion`이다. 파일이 깨진 것과 구분한다. */
export class UnsupportedSchemaError extends ContractError {
  override name = 'UnsupportedSchemaError';
}

type Json = Record<string, unknown>;
type Decoder<T> = (value: unknown, path: string) => T;

const fail = (path: string, message: string): never => {
  throw new ContractError(`${path}: ${message}`);
};

const describe = (value: unknown) =>
  value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;

const object: Decoder<Json> = (value, path) =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Json)
    : fail(path, `expected object, got ${describe(value)}`);

const string: Decoder<string> = (value, path) =>
  typeof value === 'string' ? value : fail(path, `expected string, got ${describe(value)}`);

const number: Decoder<number> = (value, path) =>
  typeof value === 'number' && Number.isFinite(value)
    ? value
    : fail(path, `expected number, got ${describe(value)}`);

const boolean: Decoder<boolean> = (value, path) =>
  typeof value === 'boolean' ? value : fail(path, `expected boolean, got ${describe(value)}`);

const oneOf =
  <const T extends string>(allowed: readonly T[]): Decoder<T> =>
  (value, path) =>
    typeof value === 'string' && (allowed as readonly string[]).includes(value)
      ? (value as T)
      : fail(path, `expected one of ${allowed.join(', ')}, got ${JSON.stringify(value)}`);

const array =
  <T>(item: Decoder<T>): Decoder<T[]> =>
  (value, path) =>
    Array.isArray(value)
      ? value.map((entry, i) => item(entry, `${path}[${i}]`))
      : fail(path, `expected array, got ${describe(value)}`);

/** Go의 nil slice는 `null`로 나간다. 비교 불가 comparison의 case 목록이 그렇다. */
const list =
  <T>(item: Decoder<T>): Decoder<T[]> =>
  (value, path) =>
    value === null ? [] : array(item)(value, path);

const nullable =
  <T>(decode: Decoder<T>): Decoder<T | null> =>
  (value, path) =>
    value === null ? null : decode(value, path);

/** Go `omitempty` field. 없으면 null이다. */
const optional =
  <T>(decode: Decoder<T>): Decoder<T | null> =>
  (value, path) =>
    value === undefined ? null : decode(value, path);

const recordOf =
  <T>(item: Decoder<T>): Decoder<Record<string, T>> =>
  (value, path) =>
    Object.fromEntries(
      Object.entries(object(value, path)).map(([key, entry]) => [
        key,
        item(entry, `${path}.${key}`),
      ]),
    );

const field = <T>(o: Json, key: string, path: string, decode: Decoder<T>): T =>
  decode(o[key], `${path}.${key}`);

const schemaVersion = (o: Json, kind: string, path: string): 1 => {
  const version = field(o, 'schemaVersion', path, number);
  if (version !== ARTIFACT_SCHEMA_VERSION) {
    throw new UnsupportedSchemaError(
      `${path}.schemaVersion: ${kind} schemaVersion ${version} is not supported; DevHub reads v${ARTIFACT_SCHEMA_VERSION}. ` +
        'Regenerate the artifact with a v1 evaluator build or add a decoder for this version',
    );
  }
  return ARTIFACT_SCHEMA_VERSION;
};

const availability = oneOf<Availability>(AVAILABILITIES);
const task = oneOf<Task>(TASKS);
const mode = oneOf(['live', 'replay']);
const runStatus = oneOf(['running', 'completed', 'partial']);

/** availability와 value의 짝을 Go `Measure.Validate`와 같은 규칙으로 본다. */
export const decodeMeasure: Decoder<Measure> = (value, path) => {
  const o = object(value, path);
  const kind = field(o, 'availability', path, availability);
  const measured = field(o, 'value', path, nullable(number));
  const reason = field(o, 'reason', path, optional(string));
  switch (kind) {
    case 'measured':
      if (measured === null || reason !== null) fail(path, 'measured has a value and no reason');
      return { availability: kind, value: measured as number };
    case 'partial':
      if (measured === null || !reason) fail(path, 'partial has a value and a reason');
      return { availability: kind, value: measured as number, reason: reason as string };
    case 'not-applicable':
      if (measured !== null) fail(path, 'not-applicable has no value');
      return { availability: kind, value: null, reason };
    default:
      if (measured !== null || !reason) fail(path, `${kind} has a reason and no value`);
      return { availability: kind, value: null, reason: reason as string };
  }
};

const dataset: Decoder<DatasetSelection> = (value, path) => {
  const o = object(value, path);
  return {
    name: field(o, 'name', path, string),
    version: field(o, 'version', path, number),
    tier: field(
      o,
      'tier',
      path,
      oneOf(['software-fixture', 'synthetic-pilot', 'golden-benchmark']),
    ),
    split: field(o, 'split', path, oneOf(['dev', 'validation', 'held-out'])),
    selectionHash: field(o, 'selectionHash', path, string),
    caseCount: field(o, 'caseCount', path, number),
  };
};

const variant: Decoder<Variant> = (value, path) => {
  const o = object(value, path);
  return {
    id: field(o, 'id', path, string),
    version: field(o, 'version', path, number),
    task: field(o, 'task', path, task),
    adapter: field(o, 'adapter', path, string),
    provider: field(o, 'provider', path, string),
    model: field(o, 'model', path, string),
    baseHost: field(o, 'baseHost', path, optional(string)),
    contractHash: field(o, 'contractHash', path, string),
    experiment: {
      promptHash: field(o, 'promptHash', path, optional(string)),
      retrieval: field(
        o,
        'retrieval',
        path,
        optional((r, rp) => ({ k: field(object(r, rp), 'k', rp, number) })),
      ),
      cascade: field(
        o,
        'cascade',
        path,
        optional((c, cp) => {
          const cascade = object(c, cp);
          return {
            model: field(cascade, 'model', cp, string),
            escalateOn: field(cascade, 'escalateOn', cp, array(string)),
          };
        }),
      ),
      baseline: field(
        o,
        'baseline',
        path,
        optional((b, bp) => {
          const baseline = object(b, bp);
          return {
            strategy: field(baseline, 'strategy', bp, string),
            category: field(baseline, 'category', bp, optional(string)),
            suggestedAction: field(baseline, 'suggestedAction', bp, optional(string)),
          };
        }),
      ),
    },
  };
};

const policy = (value: unknown, path: string) => ({
  version: field(object(value, path), 'version', path, string),
});

export const decodeRunMetadata = (value: unknown, path = 'metadata'): RunMetadata => {
  const o = object(value, path);
  const version = schemaVersion(o, 'run metadata', path);
  const variants = field(o, 'variants', path, array(variant));
  if (variants.length === 0) fail(`${path}.variants`, 'expected at least one variant');
  const tasks = new Set(variants.map((v) => v.task));
  if (tasks.size !== 1) fail(`${path}.variants`, `variants mix tasks ${[...tasks].join(', ')}`);
  const source = field(o, 'source', path, object);
  const controls = field(o, 'controls', path, object);
  const at = (name: string) => `${path}.${name}`;
  return {
    schemaVersion: version,
    runId: field(o, 'runId', path, string),
    task: variants[0].task,
    startedAt: field(o, 'startedAt', path, string),
    finishedAt: field(o, 'finishedAt', path, nullable(string)),
    status: field(o, 'status', path, runStatus),
    abort: field(o, 'abort', path, optional(string)),
    mode: field(o, 'mode', path, mode),
    source: {
      commit: field(source, 'commit', at('source'), string),
      dirty: field(source, 'dirty', at('source'), boolean),
      sourceHash: field(source, 'sourceHash', at('source'), string),
      evaluatorHash: field(source, 'evaluatorHash', at('source'), string),
    },
    dataset: field(o, 'dataset', path, dataset),
    selectedCaseIds: field(o, 'selectedCaseIds', path, array(string)),
    variants,
    policy: field(o, 'policy', path, policy),
    evaluatorPolicyHash: field(o, 'evaluatorPolicyHash', path, string),
    labelContractHash: field(o, 'labelContractHash', path, string),
    trials: field(field(o, 'sampling', path, object), 'trials', at('sampling'), number),
    controls: {
      allowApi: field(controls, 'allowApi', at('controls'), boolean),
      callBudget: field(controls, 'callBudget', at('controls'), number),
      allowDrafts: field(controls, 'allowDrafts', at('controls'), boolean),
      allowHeldOut: field(controls, 'allowHeldOut', at('controls'), boolean),
    },
    retriedFrom: field(o, 'retriedFrom', path, optional(string)),
  };
};

const judgement: Decoder<Judgement> = (value, path) => {
  const o = object(value, path);
  return {
    availability: field(o, 'availability', path, availability),
    valid: field(o, 'valid', path, boolean),
  };
};

const observedText: Decoder<ObservedText> = (value, path) => {
  const o = object(value, path);
  return {
    availability: field(o, 'availability', path, availability),
    value: field(o, 'value', path, optional(string)),
    reason: field(o, 'reason', path, optional(string)),
  };
};

const modelTrace: Decoder<ModelTrace> = (value, path) => {
  const o = object(value, path);
  return {
    requested: field(o, 'requested', path, string),
    answered: field(o, 'answered', path, observedText),
  };
};

const raw: Decoder<RawObservation> = (value, path) => {
  const o = object(value, path);
  return {
    text: field(o, 'text', path, observedText),
    syntax: field(o, 'syntax', path, judgement),
    shape: field(o, 'shape', path, judgement),
    parser: field(o, 'parser', path, judgement),
  };
};

const image = (value: unknown, path: string) => {
  const o = object(value, path);
  return {
    path: field(o, 'path', path, string),
    mediaType: field(o, 'mediaType', path, string),
    sha256: field(o, 'sha256', path, string),
  };
};

/** wire의 task branch 하나(`expected.classification` 등)만 있어야 한다. */
const branch = (value: unknown, path: string, key: string, all: readonly string[]): unknown => {
  const o = object(value, path);
  const present = all.filter((name) => o[name] !== undefined);
  if (present.length !== 1 || present[0] !== key) {
    fail(path, `expected exactly the ${key} branch, got ${present.join(', ') || 'none'}`);
  }
  return o[key];
};

const EXPECTED = ['classification', 'textExtraction', 'translation'];

const caseTask = (o: Json, path: string) => {
  const kind = field(o, 'task', path, task);
  const input = field(o, 'input', path, object);
  const expected = field(o, 'expected', path, object);
  const prediction = field(o, 'prediction', path, nullable(object));
  const at = (name: string) => `${path}.${name}`;
  switch (kind) {
    case 'image-classification': {
      const e = object(
        branch(expected, at('expected'), 'classification', EXPECTED),
        at('expected.classification'),
      );
      const p =
        prediction &&
        object(
          branch(prediction, at('prediction'), 'classification', ['classification', 'text']),
          at('prediction.classification'),
        );
      const pAt = at('prediction.classification');
      return {
        task: kind,
        input: { image: field(input, 'image', at('input'), image) },
        expected: {
          category: field(e, 'category', at('expected.classification'), string),
          intent: field(
            e,
            'intent',
            at('expected.classification'),
            oneOf(['resolved', 'adjudicated', 'unresolved']),
          ),
          acceptableActions: field(
            e,
            'acceptableActions',
            at('expected.classification'),
            array(string),
          ),
          forbiddenActions: field(
            e,
            'forbiddenActions',
            at('expected.classification'),
            array(string),
          ),
          facts:
            field(e, 'facts', at('expected.classification'), optional(array(expectedFact))) ?? [],
        },
        retrieval: field(o, 'retrieval', path, optional(retrievalTrace)),
        cascade: field(o, 'cascade', path, optional(cascadeTrace)),
        prediction: p && {
          category: field(p, 'category', pAt, string),
          facts: field(
            p,
            'facts',
            pAt,
            array((f, fp) => {
              const fact = object(f, fp);
              return {
                label: field(fact, 'label', fp, string),
                value: field(fact, 'value', fp, string),
              };
            }),
          ),
          suggestedAction: field(p, 'suggestedAction', pAt, string),
          confidence: field(p, 'confidence', pAt, string),
        },
      } as const;
    }
    case 'text-extraction': {
      const eAt = at('expected.textExtraction');
      const e = object(branch(expected, at('expected'), 'textExtraction', EXPECTED), eAt);
      return {
        task: kind,
        input: {
          image: field(input, 'image', at('input'), image),
          language: field(input, 'language', at('input'), optional(string)),
        },
        expected: {
          text: field(e, 'text', eAt, string),
          readingOrder: field(e, 'readingOrder', eAt, string),
          tokenizer: field(e, 'tokenizer', eAt, optional(string)),
          fields:
            field(
              e,
              'fields',
              eAt,
              optional(
                array((f, fp) => {
                  const ef = object(f, fp);
                  return {
                    id: field(ef, 'id', fp, string),
                    aliases: field(ef, 'aliases', fp, array(string)),
                    acceptedValues: field(ef, 'acceptedValues', fp, array(string)),
                    important: field(ef, 'important', fp, boolean),
                  };
                }),
              ),
            ) ?? [],
        },
        prediction: prediction && {
          text: field(prediction, 'text', at('prediction'), string),
          fields: field(prediction, 'fields', at('prediction'), optional(recordOf(string))) ?? {},
        },
      } as const;
    }
    case 'translation': {
      const eAt = at('expected.translation');
      const e = object(branch(expected, at('expected'), 'translation', EXPECTED), eAt);
      const text = field(input, 'text', at('input'), object);
      return {
        task: kind,
        input: {
          sourceText: field(text, 'sourceText', at('input.text'), string),
          sourceLanguage: field(text, 'sourceLanguage', at('input.text'), string),
          targetLanguage: field(text, 'targetLanguage', at('input.text'), string),
        },
        expected: {
          references: field(e, 'references', eAt, array(string)),
          criticalSpans:
            field(
              e,
              'criticalSpans',
              eAt,
              optional(
                array((s, sp) => {
                  const span = object(s, sp);
                  return {
                    id: field(span, 'id', sp, string),
                    kind: field(span, 'kind', sp, string),
                    accepted: field(span, 'accepted', sp, array(string)),
                  };
                }),
              ),
            ) ?? [],
        },
        prediction: prediction && {
          text: field(prediction, 'text', at('prediction'), string),
          targetLanguage: field(prediction, 'targetLanguage', at('prediction'), optional(string)),
        },
      } as const;
    }
  }
};

export const decodeCaseResult = (value: unknown, path = 'case'): CaseResult => {
  const o = object(value, path);
  const version = schemaVersion(o, 'case result', path);
  const execution = field(o, 'execution', path, object);
  const quality = field(o, 'quality', path, object);
  const usage = field(o, 'usage', path, object);
  const at = (name: string) => `${path}.${name}`;
  const error = field(execution, 'error', at('execution'), nullable(object));
  const status = field(
    execution,
    'status',
    at('execution'),
    oneOf(['completed', 'failed', 'timed-out', 'skipped', 'not-run']),
  );
  const specific = caseTask(o, path);
  if (specific.prediction !== null && status !== 'completed') {
    fail(at('prediction'), `a ${status} execution has no prediction`);
  }
  return {
    schemaVersion: version,
    runId: field(o, 'runId', path, string),
    invocationId: field(o, 'invocationId', path, string),
    caseId: field(o, 'caseId', path, string),
    caseRevision: field(o, 'caseRevision', path, number),
    variantId: field(o, 'variantId', path, string),
    trial: field(o, 'trial', path, number),
    mode: field(o, 'mode', path, mode),
    execution: {
      status,
      attempts: field(execution, 'attempts', at('execution'), number),
      error: error && {
        class: field(
          error,
          'class',
          at('execution.error'),
          oneOf(['timeout', 'provider', 'contract', 'transport', 'other']),
        ),
        kind: field(error, 'kind', at('execution.error'), optional(string)),
        message: field(error, 'message', at('execution.error'), string),
      },
    },
    quality: {
      outcome: field(
        quality,
        'outcome',
        at('quality'),
        oneOf(['passed', 'failed', 'not-evaluated', 'unscored']),
      ),
      checks: field(
        quality,
        'checks',
        at('quality'),
        array((c, cp) => {
          const check = object(c, cp);
          return {
            name: field(check, 'name', cp, string),
            outcome: field(check, 'outcome', cp, oneOf(['passed', 'failed'])),
          };
        }),
      ),
    },
    metrics: field(o, 'metrics', path, recordOf(decodeMeasure)),
    durationMs: field(o, 'durationMs', path, decodeMeasure),
    usage: {
      inputTokens: field(usage, 'inputTokens', at('usage'), decodeMeasure),
      outputTokens: field(usage, 'outputTokens', at('usage'), decodeMeasure),
    },
    cost: field(field(o, 'cost', path, object), 'amount', at('cost'), decodeMeasure),
    raw: field(o, 'raw', path, nullable(raw)),
    model: field(o, 'model', path, optional(modelTrace)),
    ...specific,
  };
};

/** `cases.jsonl` 전체. 마지막 줄이 개행으로 끝나지 않으면 잘린 파일이다. */
export const decodeCaseLines = (text: string, path = 'cases.jsonl'): CaseResult[] => {
  if (text === '') return [];
  if (!text.endsWith('\n')) fail(path, 'ends without a newline: the last line is truncated');
  return text
    .slice(0, -1)
    .split('\n')
    .map((line, i) => {
      const at = `${path}:${i + 1}`;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        return fail(at, 'is not JSON');
      }
      return decodeCaseResult(parsed, at);
    });
};

const count = (o: Json, key: string, path: string) => field(o, key, path, number);

const common = (o: Json, path: string) => ({
  selected: count(o, 'selected', path),
  evaluated: count(o, 'evaluated', path),
  notRun: count(o, 'notRun', path),
  complete: field(o, 'complete', path, boolean),
  predicted: count(o, 'predicted', path),
  passRate: field(o, 'passRate', path, decodeMeasure),
});

const classificationQuality: Decoder<ClassificationQuality> = (value, path) => {
  const o = object(value, path);
  const category = field(o, 'category', path, object);
  const action = field(o, 'action', path, object);
  const risk = field(o, 'risk', path, object);
  const cAt = `${path}.category`;
  return {
    ...common(o, path),
    categoryAccuracy: field(category, 'accuracy', cAt, decodeMeasure),
    macroF1: field(category, 'macroF1', cAt, decodeMeasure),
    macroCoverage: field(category, 'macroCoverage', cAt, oneOf(['full', 'subset'])),
    missingLabels: field(category, 'missingLabels', cAt, array(string)),
    labels: field(
      category,
      'labels',
      cAt,
      recordOf((l, lp) => {
        const label = object(l, lp);
        return {
          support: count(label, 'support', lp),
          tp: count(label, 'tp', lp),
          fp: count(label, 'fp', lp),
          fn: count(label, 'fn', lp),
          precision: field(label, 'precision', lp, decodeMeasure),
          recall: field(label, 'recall', lp, decodeMeasure),
          f1: field(label, 'f1', lp, decodeMeasure),
        };
      }),
    ),
    canonicalActionExactMatch: field(
      action,
      'canonicalExactMatch',
      `${path}.action`,
      decodeMeasure,
    ),
    acceptedActionAccuracy: field(action, 'acceptedAccuracy', `${path}.action`, decodeMeasure),
    jointExactMatch: field(o, 'jointExactMatch', path, decodeMeasure),
    criticalRate: field(risk, 'criticalRate', `${path}.risk`, decodeMeasure),
    criticalOrUnobservedRate: field(
      risk,
      'criticalOrUnobservedRate',
      `${path}.risk`,
      decodeMeasure,
    ),
    categoryInvalid: count(category, 'invalid', cAt),
    confusion: field(category, 'confusion', cAt, recordOf(recordOf(number))),
    risk: {
      eligible: count(risk, 'eligible', `${path}.risk`),
      observed: count(risk, 'observed', `${path}.risk`),
      unobserved: count(risk, 'unobserved', `${path}.risk`),
      critical: count(risk, 'critical', `${path}.risk`),
    },
    raw: {
      syntax: field(o, 'rawSyntax', path, tally),
      shape: field(o, 'rawShape', path, tally),
      parser: field(o, 'parser', path, tally),
    },
    ...experimentQuality(o, path),
  };
};

const expectedFact: Decoder<ExpectedFact> = (value, path) => {
  const o = object(value, path);
  return {
    id: field(o, 'id', path, string),
    label: field(o, 'label', path, string),
    kind: field(o, 'kind', path, string),
    acceptedValues: field(o, 'acceptedValues', path, array(string)),
    requiredFor: field(o, 'requiredFor', path, array(string)),
  };
};

const retrievalTrace: Decoder<RetrievalTrace> = (value, path) => ({
  examples: field(
    object(value, path),
    'examples',
    path,
    array((e, ep) => {
      const example = object(e, ep);
      return {
        caseId: field(example, 'caseId', ep, string),
        category: field(example, 'category', ep, string),
        similarity: field(example, 'similarity', ep, number),
      };
    }),
  ),
});

const cascadeTrace: Decoder<CascadeTrace> = (value, path) => {
  const o = object(value, path);
  return {
    firstModel: field(o, 'firstModel', path, string),
    firstConfidence: field(o, 'firstConfidence', path, optional(string)),
    escalated: field(o, 'escalated', path, boolean),
  };
};

/** 추출값 · 자동 실행 · 비슷한 사례 · 계단식 집계. 전부 v1 안의 선택 field라 없으면 null이다. */
const experimentQuality = (o: Json, path: string) => {
  const m = (sub: Json, key: string, sp: string) => field(sub, key, sp, decodeMeasure);
  return {
    facts: field(
      o,
      'facts',
      path,
      optional((f, fp) => {
        const facts = object(f, fp);
        return {
          annotated: count(facts, 'annotated', fp),
          expected: count(facts, 'expected', fp),
          found: count(facts, 'found', fp),
          recall: m(facts, 'recall', fp),
          readyEligible: count(facts, 'readyEligible', fp),
          ready: count(facts, 'ready', fp),
          readyRate: m(facts, 'readyRate', fp),
        };
      }),
    ),
    calibration: field(
      o,
      'calibration',
      path,
      optional((c, cp) => {
        const k = object(c, cp);
        return {
          high: count(k, 'high', cp),
          highWrong: count(k, 'highWrong', cp),
          highWrongRate: m(k, 'highWrongRate', cp),
          autoExecuted: count(k, 'autoExecuted', cp),
          autoCorrect: count(k, 'autoCorrect', cp),
          autoPrecision: m(k, 'autoPrecision', cp),
          autoCoverage: m(k, 'autoCoverage', cp),
        };
      }),
    ),
    retrieval: field(
      o,
      'retrieval',
      path,
      optional((r, rp) => {
        const k = object(r, rp);
        return {
          queries: count(k, 'queries', rp),
          top1Correct: count(k, 'top1Correct', rp),
          top1Rate: m(k, 'top1Rate', rp),
          anyCorrect: count(k, 'anyCorrect', rp),
          hitRate: m(k, 'hitRate', rp),
          meanReciprocalRank: m(k, 'meanReciprocalRank', rp),
        };
      }),
    ),
    cascade: field(
      o,
      'cascade',
      path,
      optional((c, cp) => {
        const k = object(c, cp);
        return {
          invocations: count(k, 'invocations', cp),
          escalated: count(k, 'escalated', cp),
          escalationRate: m(k, 'escalationRate', cp),
        };
      }),
    ),
  };
};

const tally: Decoder<Tally> = (value, path) => {
  const o = object(value, path);
  return {
    valid: count(o, 'valid', path),
    invalid: count(o, 'invalid', path),
    unobserved: count(o, 'unobserved', path),
  };
};

const fieldStat: Decoder<FieldStat> = (value, path) => {
  const o = object(value, path);
  return {
    id: field(o, 'id', path, string),
    support: count(o, 'support', path),
    important: count(o, 'important', path),
    evaluated: count(o, 'evaluated', path),
    correct: count(o, 'correct', path),
    wrong: count(o, 'wrong', path),
    missing: count(o, 'missing', path),
    accuracy: field(o, 'accuracy', path, decodeMeasure),
  };
};

const textQuality: Decoder<TextQuality> = (value, path) => {
  const o = object(value, path);
  const m = (key: string) => field(o, key, path, decodeMeasure);
  return {
    ...common(o, path),
    normalization: field(o, 'normalization', path, string),
    unicode: field(o, 'unicode', path, string),
    rawExactMatchRate: m('rawExactMatchRate'),
    normalizedExactMatchRate: m('normalizedExactMatchRate'),
    corpusCer: m('corpusCer'),
    meanCaseCer: m('meanCaseCer'),
    corpusWer: m('corpusWer'),
    meanCaseWer: m('meanCaseWer'),
    fieldAccuracy: m('fieldAccuracy'),
    importantFieldRecall: m('importantFieldRecall'),
    emptyReferences: count(o, 'emptyReferences', path),
    hallucinatedChars: count(o, 'hallucinatedChars', path),
    fieldStats: field(o, 'fieldStats', path, optional(array(fieldStat))) ?? [],
  };
};

const translationQuality: Decoder<TranslationQuality> = (value, path) => {
  const o = object(value, path);
  const m = (key: string) => field(o, key, path, decodeMeasure);
  return {
    ...common(o, path),
    normalization: field(o, 'normalization', path, string),
    unicode: field(o, 'unicode', path, string),
    rawExactMatchRate: m('rawExactMatchRate'),
    normalizedExactMatchRate: m('normalizedExactMatchRate'),
    languageMetadataRate: m('languageMetadataRate'),
    criticalSpanRecall: m('criticalSpanRecall'),
    semanticSimilarity: m('semanticSimilarity'),
    bleu: m('bleu'),
    chrf: m('chrf'),
    judge: m('judge'),
    scored: field(o, 'scored', path, boolean),
    unscored: count(o, 'unscored', path),
  };
};

const QUALITY = ['classification', 'text', 'translation'];

const trialQuality =
  (kind: Task): Decoder<TrialQuality> =>
  (value, path) => {
    const o = object(value, path);
    const trial = count(o, 'trial', path);
    switch (kind) {
      case 'image-classification':
        return {
          task: kind,
          trial,
          quality: classificationQuality(
            branch(o, path, 'classification', QUALITY),
            `${path}.classification`,
          ),
        };
      case 'text-extraction':
        return {
          task: kind,
          trial,
          quality: textQuality(branch(o, path, 'text', QUALITY), `${path}.text`),
        };
      case 'translation':
        return {
          task: kind,
          trial,
          quality: translationQuality(
            branch(o, path, 'translation', QUALITY),
            `${path}.translation`,
          ),
        };
    }
  };

const latency: Decoder<LatencyStats> = (value, path) => {
  const o = object(value, path);
  return {
    n: count(o, 'n', path),
    meanMs: field(o, 'meanMs', path, decodeMeasure),
    medianMs: field(o, 'medianMs', path, decodeMeasure),
    p95Ms: field(o, 'p95Ms', path, decodeMeasure),
  };
};

const variantReport: Decoder<VariantReport> = (value, path) => {
  const o = object(value, path);
  const v = field(o, 'variant', path, variant);
  const e = field(o, 'execution', path, object);
  const out = field(o, 'outcome', path, object);
  const r = field(o, 'reliability', path, object);
  const l = field(o, 'latency', path, object);
  const c = field(o, 'cost', path, object);
  const u = field(c, 'usage', `${path}.cost`, object);
  const at = (name: string) => `${path}.${name}`;
  const counts = (source: Json, where: string, keys: readonly string[]) =>
    Object.fromEntries(keys.map((key) => [key, count(source, key, at(where))]));
  return {
    variant: v,
    trials: count(o, 'trials', path),
    execution: {
      ...(counts(e, 'execution', [
        'selected',
        'invocations',
        'attempted',
        'completed',
        'failed',
        'timedOut',
        'unsupported',
        'notRun',
        'cancelled',
        'missing',
      ]) as Omit<VariantReport['execution'], 'carried'>),
      carried: field(e, 'carried', at('execution'), optional(number)) ?? 0,
    },
    outcome: counts(out, 'outcome', ['passed', 'failed', 'unscored']) as VariantReport['outcome'],
    quality: field(o, 'quality', path, array(trialQuality(v.task))),
    reliability: {
      attempted: count(r, 'attempted', at('reliability')),
      completed: count(r, 'completed', at('reliability')),
      wireCalls: count(r, 'wireCalls', at('reliability')),
      completionRate: field(r, 'completionRate', at('reliability'), decodeMeasure),
      errorsByClass: field(r, 'errorsByClass', at('reliability'), recordOf(number)),
      errorsByKind: field(r, 'errorsByKind', at('reliability'), recordOf(number)),
    },
    latency: {
      definition: field(l, 'definition', at('latency'), string),
      attempted: field(l, 'attempted', at('latency'), latency),
      completed: field(l, 'completed', at('latency'), latency),
    },
    cost: {
      wireCalls: count(c, 'wireCalls', at('cost')),
      inputTokens: field(u, 'inputTokens', at('cost.usage'), decodeMeasure),
      outputTokens: field(u, 'outputTokens', at('cost.usage'), decodeMeasure),
      usageKnown: count(u, 'known', at('cost.usage')),
      usageUnknown: count(u, 'unknown', at('cost.usage')),
      estimated: field(c, 'estimated', at('cost'), decodeMeasure),
      actual: field(c, 'actual', at('cost'), decodeMeasure),
    },
    models: field(
      o,
      'models',
      path,
      optional((m, mp) => {
        const models = object(m, mp);
        return {
          answered: field(models, 'answered', mp, recordOf(number)),
          unknown: count(models, 'unknown', mp),
          different: count(models, 'different', mp),
        };
      }),
    ),
  };
};

export const decodeRunSummary = (value: unknown, path = 'summary'): RunSummary => {
  const o = object(value, path);
  return {
    schemaVersion: schemaVersion(o, 'run summary', path),
    runId: field(o, 'runId', path, string),
    mode: field(o, 'mode', path, mode),
    status: field(o, 'status', path, runStatus),
    abort: field(o, 'abort', path, optional(string)),
    dataset: field(o, 'dataset', path, dataset),
    policy: field(o, 'policy', path, policy),
    officialEligible: field(o, 'officialEligible', path, boolean),
    reasons: field(o, 'reasons', path, array(string)),
    variants: field(o, 'variants', path, array(variantReport)),
  };
};

const metricDelta: Decoder<MetricDelta> = (value, path) => {
  const o = object(value, path);
  return {
    name: field(o, 'name', path, string),
    direction: field(o, 'direction', path, oneOf(['higher-is-better', 'lower-is-better'])),
    baseline: field(o, 'baseline', path, decodeMeasure),
    candidate: field(o, 'candidate', path, decodeMeasure),
    absoluteDelta: field(o, 'absoluteDelta', path, decodeMeasure),
    deltaPp: field(o, 'deltaPp', path, decodeMeasure),
    relativePercent: field(o, 'relativePercent', path, decodeMeasure),
    change: field(
      o,
      'change',
      path,
      oneOf(['improved', 'regressed', 'unchanged', 'not-comparable']),
    ),
  };
};

const caseChange: Decoder<CaseChange> = (value, path) => {
  const o = object(value, path);
  const s = (key: string) => field(o, key, path, string);
  return {
    caseId: s('caseId'),
    check: s('check'),
    baseline: s('baseline'),
    candidate: s('candidate'),
    baselinePrediction: s('baselinePrediction'),
    candidatePrediction: s('candidatePrediction'),
  };
};

const runRef = (value: unknown, path: string) => {
  const o = object(value, path);
  return {
    runId: field(o, 'runId', path, string),
    variantId: field(o, 'variantId', path, string),
    trial: count(o, 'trial', path),
  };
};

export const decodeComparison = (value: unknown, path = 'comparison'): Comparison => {
  const o = object(value, path);
  const cases = field(o, 'cases', path, object);
  const cAt = `${path}.cases`;
  const changes = (key: string) => field(cases, key, cAt, list(caseChange));
  return {
    schemaVersion: schemaVersion(o, 'comparison', path),
    comparisonId: field(o, 'comparisonId', path, string),
    baseline: field(o, 'baseline', path, runRef),
    baselineVariant: field(o, 'baselineVariant', path, variant),
    candidate: field(o, 'candidate', path, runRef),
    candidateVariant: field(o, 'candidateVariant', path, variant),
    dataset: field(o, 'dataset', path, dataset),
    policy: field(o, 'policy', path, policy),
    comparable: field(o, 'comparable', path, boolean),
    incomparable: field(o, 'incomparable', path, array(string)),
    warnings: field(o, 'warnings', path, array(string)),
    axes: field(
      o,
      'axes',
      path,
      array((a, ap) => {
        const axis = object(a, ap);
        return {
          axis: field(axis, 'axis', ap, string),
          comparable: field(axis, 'comparable', ap, boolean),
          reason: field(axis, 'reason', ap, optional(string)),
          metrics: field(axis, 'metrics', ap, array(metricDelta)),
        };
      }),
    ),
    labels: field(
      o,
      'labels',
      path,
      list((value, lp) => {
        const l = object(value, lp);
        return {
          label: field(l, 'label', lp, string),
          support: count(l, 'support', lp),
          precision: field(l, 'precision', lp, metricDelta),
          recall: field(l, 'recall', lp, metricDelta),
          f1: field(l, 'f1', lp, metricDelta),
        };
      }),
    ),
    cases: {
      paired: count(cases, 'paired', cAt),
      unpaired: field(cases, 'unpaired', cAt, array(string)),
      predictionChanged: count(cases, 'predictionChanged', cAt),
      newlyFailed: changes('newlyFailed'),
      fixed: changes('fixed'),
      newlyErrored: changes('newlyErrored'),
      errorsResolved: changes('errorsResolved'),
      newCritical: changes('newCritical'),
      criticalResolved: changes('criticalResolved'),
    },
    gate: field(
      o,
      'gate',
      path,
      nullable((g, gp) => {
        const gate = object(g, gp);
        return {
          policyVersion: field(
            field(gate, 'policy', gp, object),
            'version',
            `${gp}.policy`,
            string,
          ),
          applicable: field(gate, 'applicable', gp, boolean),
          reason: field(gate, 'reason', gp, optional(string)),
          passed: field(gate, 'passed', gp, boolean),
          rules: field(
            gate,
            'rules',
            gp,
            array((r, rp) => {
              const rule = object(r, rp);
              return {
                rule: field(rule, 'rule', rp, string),
                limit: field(rule, 'limit', rp, number),
                observed: field(rule, 'observed', rp, decodeMeasure),
                passed: field(rule, 'passed', rp, boolean),
              };
            }),
          ),
        };
      }),
    ),
    conclusion: field(o, 'conclusion', path, string),
  };
};
