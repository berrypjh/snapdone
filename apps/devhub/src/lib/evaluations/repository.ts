import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { connection } from 'next/server';

import { REPOSITORY_ROOT } from '../repository/snapshot';

import type { CaseResult, Comparison, RunMetadata, RunSummary } from './contract';
import {
  ContractError,
  decodeCaseLines,
  decodeComparison,
  decodeRunMetadata,
  decodeRunSummary,
  UnsupportedSchemaError,
} from './decode';
import { readVariantCatalog } from './variant-catalog';
import type { VariantCatalog } from './variant-command';

/**
 * 서버 전용. `tools/evals/results`의 평가 산출물을 저장소 파일에서 바로 읽는다. 채점은 Go가 끝낸 값을 그대로 쓰고
 * 여기서 다시 판정하지 않는다. 경로는 검증한 id로만 만들고 symlink는 따라가지 않는다.
 */

/** 결과 root. 저장소 root 기준이다. */
export const RESULTS_DIR = 'tools/evals/results';
const COMPARISONS = 'comparisons';

/**
 * 화면이 나눠 보여 줄 실패 종류.
 * - `not-found` — 그런 run · comparison이 없다(결과 root가 없는 것도 포함)
 * - `invalid-id` — id가 식별자 규칙(소문자 · 숫자 · `-`)을 어긴다. 파일 시스템을 보지 않는다
 * - `invalid-artifact` — 파일이 없거나 JSON · 계약에 맞지 않는다(잘린 `cases.jsonl` 포함)
 * - `unsupported-schema` — 모양은 읽히지만 모르는 `schemaVersion`이다
 * - `incomplete` — 아직 도는 중이거나 중단된 run, 또는 파생 요약이 없다
 */
export type EvaluationErrorKind =
  'not-found' | 'invalid-id' | 'invalid-artifact' | 'unsupported-schema' | 'incomplete';

export class EvaluationArtifactError extends Error {
  override name = 'EvaluationArtifactError';

  constructor(
    readonly kind: EvaluationErrorKind,
    message: string,
    readonly path: string | null = null,
  ) {
    super(message);
  }
}

/** Go `identifier`와 같은 규칙. 이 규칙을 지나야만 경로에 들어간다. */
export const isArtifactId = (value: string) => /^[a-z0-9-]{1,128}$/.test(value);

export type RunDetail = {
  id: string;
  metadata: RunMetadata;
  cases: CaseResult[];
  summary: RunSummary;
};

/** 목록 한 줄. 읽지 못한 run도 숨기지 않고 이유와 함께 남긴다. metadata는 읽힌 만큼만 있다. */
export type RunEntry =
  | { id: string; state: 'ready'; metadata: RunMetadata; summary: RunSummary }
  | { id: string; state: 'error'; metadata: RunMetadata | null; error: EvaluationArtifactError };

export type ComparisonEntry =
  | { id: string; state: 'ready'; comparison: Comparison }
  | { id: string; state: 'error'; error: EvaluationArtifactError };

export type EvaluationRepository = {
  /** 최근에 시작한 run부터. 시작 시각이 같으면 id 순, metadata를 못 읽은 run은 뒤에 id 순. */
  listRuns: () => RunEntry[];
  getRun: (id: string) => RunDetail;
  /** comparison id 순. */
  listComparisons: () => ComparisonEntry[];
  getComparison: (id: string) => Comparison;
  /** 명령 만들기에서 고를 variant · dataset(`tools/evals/variants` · `datasets`). */
  variantCatalog: () => VariantCatalog;
};

/** `repositoryRoot` 아래의 결과만 읽는 repository. 테스트는 임시 디렉터리를 root로 준다. */
export const evaluationRepository = (repositoryRoot: string): EvaluationRepository => {
  const results = join(repositoryRoot, RESULTS_DIR);
  const where = (...parts: string[]) => [RESULTS_DIR, ...parts].join('/');

  const readRun = (id: string) => {
    const metadata = readArtifact(
      results,
      id,
      'metadata.json',
      where(id, 'metadata.json'),
      decodeRunMetadata,
    );
    if (metadata.runId !== id) {
      throw invalid(
        where(id, 'metadata.json'),
        `runId ${metadata.runId} does not match its directory ${id}`,
      );
    }
    if (metadata.status === 'running') {
      throw new EvaluationArtifactError(
        'incomplete',
        `run ${id} is still running or stopped before it finished; its summary is not written yet`,
        where(id),
      );
    }
    return metadata;
  };

  const readSummary = (id: string, metadata: RunMetadata) => {
    const path = where(id, 'summary.json');
    if (!isFile(join(results, id, 'summary.json'))) {
      throw new EvaluationArtifactError(
        'incomplete',
        `run ${id} has no summary.json; regenerate it with \`pnpm eval report --run ${id}\``,
        path,
      );
    }
    const summary = readArtifact(results, id, 'summary.json', path, decodeRunSummary);
    if (summary.runId !== id || summary.status !== metadata.status) {
      throw invalid(
        path,
        `summary (${summary.runId}, ${summary.status}) does not match metadata (${id}, ${metadata.status})`,
      );
    }
    return summary;
  };

  const runEntry = (id: string): RunEntry => {
    let metadata: RunMetadata | null = null;
    try {
      metadata = readRun(id);
      return { id, state: 'ready', metadata, summary: readSummary(id, metadata) };
    } catch (error) {
      const known = asArtifactError(error);
      if (known.kind === 'incomplete' && !metadata) metadata = peekMetadata(results, id);
      return { id, state: 'error', metadata, error: known };
    }
  };

  return {
    variantCatalog: () => readVariantCatalog(repositoryRoot),
    listRuns: () =>
      artifactDirs(results)
        .filter((id) => id !== COMPARISONS)
        .map(runEntry)
        .sort(byRecentStart),
    getRun: (id) => {
      directoryOf(results, id, 'run', where(id));
      const metadata = readRun(id);
      const summary = readSummary(id, metadata);
      const casesPath = where(id, 'cases.jsonl');
      const cases = decodeArtifact(casesPath, () =>
        decodeCaseLines(readText(join(results, id, 'cases.jsonl'), casesPath), casesPath),
      );
      return { id, metadata, cases, summary };
    },
    listComparisons: () =>
      artifactDirs(join(results, COMPARISONS)).map((id): ComparisonEntry => {
        try {
          return { id, state: 'ready', comparison: readComparison(results, id) };
        } catch (error) {
          return { id, state: 'error', error: asArtifactError(error) };
        }
      }),
    getComparison: (id) => {
      directoryOf(
        join(results, COMPARISONS),
        id,
        'comparison',
        [RESULTS_DIR, COMPARISONS, id].join('/'),
      );
      return readComparison(results, id);
    },
  };
};

/**
 * 페이지 · 서버 컴포넌트가 쓰는 입구. `connection()`을 먼저 기다리므로 이 함수를 부르는 route는 build 때
 * 굳지 않고 요청마다 파일을 다시 읽는다 — `next dev` 중에 새 run이 생겨도 보인다.
 */
export const localEvaluations = async (): Promise<EvaluationRepository> => {
  await connection();
  if (!REPOSITORY_ROOT) {
    throw new EvaluationArtifactError(
      'not-found',
      'repository root (pnpm-workspace.yaml) was not found',
    );
  }
  return evaluationRepository(REPOSITORY_ROOT);
};

const invalid = (path: string, message: string) =>
  new EvaluationArtifactError('invalid-artifact', `${path}: ${message}`, path);

const isFile = (path: string) => {
  try {
    return lstatSync(path).isFile();
  } catch {
    return false;
  }
};

const isDirectory = (path: string) => {
  try {
    return lstatSync(path).isDirectory();
  } catch {
    return false;
  }
};

/** 결과 root 아래의 식별자 이름 디렉터리. 파일 · symlink · 식별자가 아닌 이름(`.DS_Store` 등)은 산출물이 아니다. */
const artifactDirs = (parent: string): string[] => {
  if (!isDirectory(parent)) return [];
  return readdirSync(parent)
    .filter((name) => isArtifactId(name) && isDirectory(join(parent, name)))
    .sort();
};

/** 검증한 id의 디렉터리. 없으면 not-found다. */
const directoryOf = (parent: string, id: string, kind: string, path: string) => {
  if (!isArtifactId(id)) {
    throw new EvaluationArtifactError(
      'invalid-id',
      `${kind} id ${JSON.stringify(id)} must be lowercase letters, digits, and dashes`,
    );
  }
  if (id === COMPARISONS && kind === 'run') {
    throw new EvaluationArtifactError(
      'not-found',
      `${COMPARISONS} is the comparison directory, not a run`,
      path,
    );
  }
  if (!isDirectory(join(parent, id))) {
    throw new EvaluationArtifactError(
      'not-found',
      `${kind} ${id} was not found under ${RESULTS_DIR}`,
      path,
    );
  }
};

const readText = (file: string, path: string) => {
  if (!isFile(file)) throw invalid(path, 'the file is missing');
  return readFileSync(file, 'utf8');
};

const decodeArtifact = <T>(path: string, decode: () => T): T => {
  try {
    return decode();
  } catch (error) {
    if (error instanceof UnsupportedSchemaError) {
      throw new EvaluationArtifactError('unsupported-schema', error.message, path);
    }
    // decoder 오류는 이미 파일 경로로 시작한다.
    if (error instanceof ContractError)
      throw new EvaluationArtifactError('invalid-artifact', error.message, path);
    if (error instanceof SyntaxError) throw invalid(path, `not JSON (${error.message})`);
    throw error;
  }
};

const readArtifact = <T>(
  results: string,
  id: string,
  name: string,
  path: string,
  decode: (value: unknown, path: string) => T,
): T =>
  decodeArtifact(path, () => decode(JSON.parse(readText(join(results, id, name), path)), path));

const readComparison = (results: string, id: string) => {
  const path = [RESULTS_DIR, COMPARISONS, id, 'comparison.json'].join('/');
  const comparison = readArtifact(
    join(results, COMPARISONS),
    id,
    'comparison.json',
    path,
    decodeComparison,
  );
  if (comparison.comparisonId !== id) {
    throw invalid(
      path,
      `comparisonId ${comparison.comparisonId} does not match its directory ${id}`,
    );
  }
  return comparison;
};

/** 목록에서 도는 중인 run도 언제 · 무엇인지 보이게 metadata만 따로 읽어 본다. */
const peekMetadata = (results: string, id: string): RunMetadata | null => {
  try {
    return decodeRunMetadata(JSON.parse(readFileSync(join(results, id, 'metadata.json'), 'utf8')));
  } catch {
    return null;
  }
};

const asArtifactError = (error: unknown): EvaluationArtifactError => {
  if (error instanceof EvaluationArtifactError) return error;
  throw error;
};

/** 시작 시각(ms). 없거나 읽을 수 없으면 null이고 그런 run은 뒤로 간다. */
const startedAt = (entry: RunEntry) => {
  const time = entry.metadata ? Date.parse(entry.metadata.startedAt) : Number.NaN;
  return Number.isFinite(time) ? time : null;
};

const byRecentStart = (a: RunEntry, b: RunEntry) => {
  const at = startedAt(a);
  const bt = startedAt(b);
  if (at !== null && bt !== null && at !== bt) return bt - at;
  if (at !== null && bt === null) return -1;
  if (at === null && bt !== null) return 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};
