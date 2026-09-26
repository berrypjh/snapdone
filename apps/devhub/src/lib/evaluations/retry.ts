import type { RunDetail } from './repository';

/**
 * 실제 모델 호출이 실패한 run의 다시 실행 안내. `pnpm eval retry`는 끝난 결과를 호출 없이 옮기고 실패 · 미실행만 다시
 * 불러, 모든 variant가 든 새 run(`<run>-retry`)을 쓴다. 값은 summary · case 결과에서 고를 뿐이고 명령 글자만 만든다.
 */

export type FailedVariant = {
  id: string;
  provider: string;
  /** 오류 class · kind · 문구별 수. 예: provider · http-status — provider returned HTTP 400 × 1 */
  errors: { text: string; count: number }[];
  failed: number;
  invocations: number;
  /** case 하나에 드는 최대 호출. 계단식 2, 그 밖 1. */
  callsPerCase: number;
};

const lines = (head: string, args: string[]) => [head, ...args].join(' \\\n  ');

/** 원인 확인용 한 번 호출. 공급자가 거절 이유를 문장으로 돌려준다. key는 환경변수로만. */
const PROBE: Record<string, (model: string) => string> = {
  anthropic: (model) =>
    lines('curl -s https://api.anthropic.com/v1/messages', [
      '-H "x-api-key: $ANTHROPIC_API_KEY" -H "anthropic-version: 2023-06-01"',
      '-H "content-type: application/json"',
      `-d '{"model":"${model}","max_tokens":16,"messages":[{"role":"user","content":"ping"}]}'`,
    ]),
  openai: () =>
    lines('curl -s https://api.openai.com/v1/models', [
      '-H "Authorization: Bearer $OPENAI_API_KEY"',
    ]),
};

export const retryGuide = (run: RunDetail) => {
  const { metadata: m, summary, cases } = run;
  if (m.mode !== 'live') return null;
  const failed: FailedVariant[] = summary.variants.flatMap((report) => {
    const v = report.variant;
    const e = report.execution;
    const count = e.failed + e.timedOut + e.notRun + e.missing;
    if (v.adapter === 'baseline' || count === 0) return [];
    const errors = new Map<string, number>();
    for (const c of cases) {
      const error = c.variantId === v.id ? c.execution.error : null;
      if (!error) continue;
      const text = `${error.class}${error.kind ? ` · ${error.kind}` : ''} — ${error.message}`;
      errors.set(text, (errors.get(text) ?? 0) + 1);
    }
    return [
      {
        id: v.id,
        provider: v.provider,
        errors: [...errors].map(([text, n]) => ({ text, count: n })),
        failed: count,
        invocations: e.invocations,
        callsPerCase: v.experiment.cascade ? 2 : 1,
      },
    ];
  });
  if (failed.length === 0) return null;

  const retryId = `${m.runId}-retry`;
  // 계단식은 case 하나에 두 번까지 부른다. 상한은 SDK 재시도(최대 3번)까지.
  const calls = failed.reduce((sum, f) => sum + f.failed * f.callsPerCase, 0);
  const rerun = lines(`pnpm eval retry --run ${m.runId}`, [
    '--allow-api',
    `--max-api-calls ${calls * 3}`,
  ]);
  const probes = [...new Set(failed.map((f) => f.provider))].flatMap((provider) => {
    const probe = PROBE[provider];
    const model =
      summary.variants.find(
        (r) => r.variant.provider === provider && failed.some((f) => f.id === r.variant.id),
      )?.variant.model ?? '';
    return probe ? [{ provider, command: probe(model) }] : [];
  });
  const carried = summary.variants.reduce((sum, r) => sum + r.execution.completed, 0);
  return { failed, probes, rerun, retryId, calls, carried };
};
