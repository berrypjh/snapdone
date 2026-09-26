import { readFileSync, writeFileSync } from 'node:fs';

import { afterEach, describe, expect, it } from 'vitest';

import { removeResults, resultsRepository } from '../../test-support/evaluation-results';

import { retryGuide } from './retry';

afterEach(removeResults);

type Json = Record<string, unknown>;

/** replay-golden을 live run으로 바꾸고 모델 variant 하나를 더해 그 호출이 HTTP 400으로 실패한 것으로 만든다. */
const failedRun = () => {
  const r = resultsRepository();
  r.copyRun('replay-golden', 'live-mixed');
  const claude = {
    id: 'claude-x',
    adapter: 'processing',
    provider: 'anthropic',
    model: 'claude-x-1',
  };
  r.edit('live-mixed/metadata.json', (m) => {
    m.mode = 'live';
    m.controls = { ...(m.controls as Json), allowApi: true, callBudget: 9 };
    const [v] = m.variants as Json[];
    (m.variants as Json[]).push({ ...v, ...claude });
  });
  r.edit('live-mixed/summary.json', (s) => {
    s.mode = 'live';
    const [v] = s.variants as Json[];
    // 원본 golden의 미실행 1건은 이 테스트의 관심 밖 — 기존 variant는 성공한 것으로 둔다.
    v.execution = { ...(v.execution as Json), notRun: 0, completed: 3 };
    const copy = JSON.parse(JSON.stringify(v)) as Json;
    Object.assign(copy.variant as Json, claude);
    copy.execution = { ...(copy.execution as Json), completed: 0, failed: 3, notRun: 0 };
    (s.variants as Json[]).push(copy);
  });
  const path = r.file('live-mixed/cases.jsonl');
  const lines = readFileSync(path, 'utf8')
    .trimEnd()
    .split('\n')
    .map((l) => JSON.parse(l) as Json);
  const failed = lines.map((line) => ({
    ...line,
    variantId: 'claude-x',
    invocationId: `claude-x/${String(line.caseId)}/1`,
    mode: 'live',
    execution: {
      status: 'failed',
      attempts: 1,
      error: { class: 'provider', kind: 'http-status', message: 'provider returned HTTP 400' },
    },
    quality: { outcome: 'not-evaluated', checks: [] },
    prediction: null,
  }));
  writeFileSync(
    path,
    [...lines.map((l) => ({ ...l, mode: 'live' })), ...failed]
      .map((l) => JSON.stringify(l))
      .join('\n') + '\n',
  );
  return r.repo.getRun('live-mixed');
};

const flat = (command: string) => command.replaceAll(' \\\n  ', ' ');

describe('retry guide', () => {
  it('retries only the failed model into one run with the successful ones', () => {
    const guide = retryGuide(failedRun());
    if (!guide) throw new Error('no guide');

    expect(guide.failed.map((f) => [f.id, f.failed, f.errors])).toEqual([
      ['claude-x', 3, [{ text: 'provider · http-status — provider returned HTTP 400', count: 3 }]],
    ]);
    // 성공한 것은 옮기고 실패한 3개만 — 상한은 SDK 재시도까지 3배.
    expect(flat(guide.rerun)).toBe(
      'pnpm eval retry --run live-mixed --allow-api --max-api-calls 9',
    );
    expect([guide.calls, guide.carried, guide.retryId]).toEqual([3, 3, 'live-mixed-retry']);
    expect(guide.probes.map((p) => p.provider)).toEqual(['anthropic']);
    expect(guide.probes[0].command).toContain('"model":"claude-x-1"');
    expect(guide.probes[0].command).toContain('$ANTHROPIC_API_KEY');
  });

  it('says nothing for replay runs or runs without model failures', () => {
    const r = resultsRepository();
    expect(retryGuide(r.repo.getRun('replay-golden'))).toBeNull();
  });
});
