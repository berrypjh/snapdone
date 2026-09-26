import { readFileSync, writeFileSync } from 'node:fs';

import { createElement } from 'react';

import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CaseFilter } from '@/lib/evaluations/detail';

import EvalRunPage from '../../app/evals/runs/[runId]/page';
import { removeResults, resultsRepository } from '../../test-support/evaluation-results';

import { parseRunView, RunDetailView } from './run-detail';

// route 입구가 요청 시점까지 기다리고, 셸의 탐색기 서랍이 경로를 읽는다(layout.spec과 같은 방식).
vi.mock('next/server', () => ({ connection: vi.fn(async () => undefined) }));
vi.mock('next/navigation', async (actual) => ({
  ...(await actual<typeof import('next/navigation')>()),
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/evals/runs/x',
}));

afterEach(removeResults);

type Json = Record<string, unknown>;

const html = (
  r: ReturnType<typeof resultsRepository>,
  id: string,
  cases: CaseFilter = 'all',
  query: { variant?: string; base?: string; show?: string } = {},
) => {
  const run = r.repo.getRun(id);
  return renderToStaticMarkup(
    createElement(RunDetailView, { run, view: parseRunView(run, { ...query, cases }) }),
  );
};

/** `cases.jsonl`의 줄을 고친다. */
const editCases = (
  r: ReturnType<typeof resultsRepository>,
  id: string,
  change: (line: Json) => void,
) => {
  const path = r.file(`${id}/cases.jsonl`);
  const lines = readFileSync(path, 'utf8')
    .trimEnd()
    .split('\n')
    .map((l) => JSON.parse(l) as Json);
  lines.forEach(change);
  writeFileSync(path, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
};

const variantOf = (summary: Json) => (summary.variants as Json[])[0];

describe('classification run', () => {
  it('shows the confusion matrix with the invalid bucket and per-label stats', () => {
    const page = html(resultsRepository(), 'replay-golden');

    expect(page).toContain('category confusion — 줄은 정답, 칸은 예측');
    expect(page).toContain('결과 없음 · 계약 밖');
    expect(page).toContain('__invalid__');
    expect(page).toContain('(맞음)');
    expect(page).toContain('category별');
    expect(page).toMatch(/TP · FP · FN/);
    // 위험 집계와 원문 판정도 Go 값 그대로 보인다.
    expect(page).toContain('금지 행동 추천 0');
    expect(page).toContain('JSON 문법 맞음 2');
  });

  it('marks a partial run and lets the not-run case be drilled into', () => {
    const r = resultsRepository();
    const page = html(r, 'replay-golden', 'not-run');

    expect(page).toContain('일부만 실행');
    expect(page).toMatch(
      /aria-current="page"[^>]*href="\/evals\/runs\/replay-golden\?variant=replay-v&amp;base=replay-v&amp;cases=not-run#run-variant"/,
    );
    expect(page).toContain('case — 미실행 1개');
    expect(page).toContain('예측 없음 — 미실행');
    expect(page).not.toContain('>case-a<');
  });
});

describe('retried run', () => {
  it('links to the original run and counts what was carried without a call', () => {
    const r = resultsRepository();
    r.copyRun('replay-golden', 'golden-retry');
    r.edit('golden-retry/metadata.json', (m) => {
      m.retriedFrom = 'replay-golden';
    });
    r.edit('golden-retry/summary.json', (s) => {
      const [v] = s.variants as Json[];
      v.execution = { ...(v.execution as Json), carried: 2 };
    });
    const page = html(r, 'golden-retry');

    expect(page).toContain('이어서 실행');
    expect(page).toContain('href="/evals/runs/replay-golden"');
    expect(page).toContain('2개 옮김');
    expect(html(r, 'replay-golden')).not.toContain('이어서 실행');
  });
});

describe('text-extraction run', () => {
  it('lists fields worst first and case CER, keeping not-applicable WER as text', () => {
    const page = html(resultsRepository(), 'text-golden');

    expect(page.indexOf('>store<')).toBeLessThan(page.indexOf('>total<'));
    expect(page).toContain('case별 CER — 높은(나쁜) 것부터');
    expect(page).toContain('CER not-applicable: empty reference: see hallucinatedChars');
    expect(page).toContain('해당 없음 — no tokenizer declared for this case');
  });
});

describe('translation run', () => {
  it('does not imply a pass rate or chart unsupported semantic metrics', () => {
    const page = html(resultsRepository(), 'translation-golden');

    expect(page).toContain('case를 채점하지 않음');
    expect(page).not.toContain('pass rate');
    expect(page).toContain('보존 구간이 빠진 case');
    expect(page).toMatch(/>tr-1<[\s\S]*?50\.0%/);
    // 의미 지표는 이유가 있는 글자 줄이고 막대가 아니다.
    expect(page).toMatch(
      />BLEU<\/span><\/span><span class="text-text-light">지원 안 함<span[^>]*>BLEU is not implemented/,
    );
  });
});

describe('latency', () => {
  it('shows replay latency as not measured, never as zero', () => {
    const page = html(resultsRepository(), 'text-golden');

    expect(page).toContain('측정 안 함 — replay: latency is not measured');
    expect(page).not.toContain('0 ms');
  });

  it('shows Go median and p95 and a histogram for a live run', () => {
    const r = resultsRepository();
    r.copyRun('text-golden', 'text-live');
    r.edit('text-live/metadata.json', (m) => {
      m.mode = 'live';
      m.controls = { ...(m.controls as Json), allowApi: true, callBudget: 10 };
    });
    const measured = (value: number) => ({ availability: 'measured', value });
    r.edit('text-live/summary.json', (s) => {
      s.mode = 'live';
      const stats = {
        n: 3,
        meanMs: measured(400),
        medianMs: measured(300),
        p95Ms: measured(700),
        note: 'small sample',
      };
      variantOf(s).latency = {
        definition: 'adapter wall time',
        attempted: stats,
        completed: stats,
      };
    });
    const durations = [200, 300, 700];
    editCases(r, 'text-live', (line) => {
      line.mode = 'live';
      line.durationMs = measured(durations.shift() ?? 0);
      (line.execution as Json).attempts = 1;
    });
    const page = html(r, 'text-live');

    expect(page).toContain('<caption>지연 요약</caption>');
    expect(page).toMatch(/중앙값[\s\S]*300 ms[\s\S]*700 ms/);
    expect(page).toContain('tv case별 시간: case 3개');
    expect(page).toContain('표본 3개');
  });
});

describe('execution failure', () => {
  it('shows the failure distribution and the failed case with its error', () => {
    const r = resultsRepository();
    r.copyRun('text-golden', 'text-failed');
    editCases(r, 'text-failed', (line) => {
      if (line.caseId !== 'ocr-2') return;
      line.execution = {
        status: 'failed',
        attempts: 1,
        error: { class: 'provider', kind: 'http-status', message: 'provider returned HTTP 500' },
      };
      line.quality = { outcome: 'not-evaluated', checks: [] };
      line.prediction = null;
    });
    r.edit('text-failed/summary.json', (s) => {
      const reliability = variantOf(s).reliability as Json;
      reliability.errorsByClass = { provider: 1 };
      reliability.errorsByKind = { 'http-status': 1 };
      const execution = variantOf(s).execution as Json;
      execution.completed = 2;
      execution.failed = 1;
    });
    const page = html(r, 'text-failed', 'errors');

    expect(page).toContain('<caption>오류 class</caption>');
    expect(page).toMatch(/>provider<\/th><td class="tabular-nums">1</);
    expect(page).toContain('실패 1');
    expect(page).toContain('case — 실행 오류 1개');
    expect(page).toContain('provider · http-status — provider returned HTTP 500');
  });
});

describe('route', () => {
  it.each(['../secret', 'Not_An_Id', 'no-such-run-anywhere'])(
    'answers 404 for %j',
    async (runId) => {
      await expect(
        EvalRunPage({ params: Promise.resolve({ runId }), searchParams: Promise.resolve({}) }),
      ).rejects.toMatchObject({ digest: expect.stringContaining('404') });
    },
  );
});

describe('experiments', () => {
  it('shows facts and the auto-run check from Go', () => {
    const page = html(resultsRepository(), 'replay-golden');

    expect(page).toContain('추출값 재현율');
    expect(page).toMatch(/추출값 재현율[\s\S]*?해당 없음<span[^>]*>no case has expected facts/);
    expect(page).toMatch(/high인데 틀림[\s\S]*?0\.0%/);
    expect(page).toMatch(/자동 실행 정확도[\s\S]*?100\.0%/);
  });

  it('shows similar cases, cascade, and the variant settings', () => {
    const r = resultsRepository();
    r.copyRun('replay-golden', 'experiment');
    const measured = (value: number) => ({ availability: 'measured', value });
    r.edit('experiment/metadata.json', (m) => {
      const [v] = m.variants as Json[];
      v.retrieval = { k: 2 };
      v.cascade = { model: 'large-model', escalateOn: ['low'] };
    });
    r.edit('experiment/summary.json', (s) => {
      const v = variantOf(s);
      Object.assign(v.variant as Json, {
        retrieval: { k: 2 },
        cascade: { model: 'large-model', escalateOn: ['low'] },
      });
      const q = (v.quality as Json[])[0].classification as Json;
      q.retrieval = {
        queries: 2,
        top1Correct: 1,
        top1Rate: measured(0.5),
        anyCorrect: 2,
        hitRate: measured(1),
        meanReciprocalRank: measured(0.75),
      };
      q.cascade = { invocations: 2, escalated: 1, escalationRate: measured(0.5) };
    });
    editCases(r, 'experiment', (line) => {
      if (line.execution && (line.execution as Json).status !== 'completed') return;
      line.retrieval = {
        examples: [{ caseId: 'neighbor-1', category: 'event', similarity: 0.91 }],
      };
      line.cascade = { firstModel: 'small-model', firstConfidence: 'low', escalated: true };
    });
    const page = html(r, 'experiment');

    expect(page).toContain(
      '실험 — 비슷한 사례 2개를 예시로 · 불확실(low)하면 large-model에 다시 물음',
    );
    expect(page).toMatch(/비슷한 사례 첫 예시 적중[\s\S]*?50\.0%/);
    expect(page).toMatch(/큰 모델 재질문 비율[\s\S]*?50\.0%/);
    expect(page).toContain('neighbor-1(event');
    expect(page).toContain('small-model</span>의 신뢰도 low → 큰 모델에 다시 물음');
  });

  it('reads a summary written before these checks without the rows', () => {
    const r = resultsRepository();
    r.copyRun('replay-golden', 'older');
    r.edit('older/summary.json', (s) => {
      const q = (variantOf(s).quality as Json[])[0].classification as Json;
      delete q.facts;
      delete q.calibration;
    });
    const page = html(r, 'older');

    expect(page).toContain('category 정확도');
    expect(page).not.toContain('추출값 재현율');
    expect(page).not.toContain('자동 실행 정확도');
  });
});

describe('answered model', () => {
  it('shows which model answered and warns when it differs from the request', () => {
    const r = resultsRepository();
    r.copyRun('replay-golden', 'models');
    r.edit('models/summary.json', (s) => {
      variantOf(s).models = {
        answered: { 'claude-sonnet-5-20260401': 1, 'claude-opus-5': 1 },
        unknown: 0,
        different: 1,
      };
    });
    const answered = ['claude-sonnet-5-20260401', 'claude-opus-5'];
    editCases(r, 'models', (line) => {
      if ((line.execution as Json).status !== 'completed') return;
      line.model = {
        requested: 'claude-sonnet-5',
        answered: { availability: 'measured', value: answered.shift() },
      };
    });
    const page = html(r, 'models');

    expect(page).toContain('답한 모델: claude-opus-5 1번 · claude-sonnet-5-20260401 1번');
    expect(page).toContain('요청과 다른 모델이 답함 1번');
    expect(page).toMatch(
      /요청 <span class="devhub-code">claude-sonnet-5<\/span> → 답 <span class="devhub-code">claude-opus-5<\/span>/,
    );
  });

  it('says there is no record for a replay without model names', () => {
    const page = html(resultsRepository(), 'replay-golden');

    expect(page).toContain('답한 모델 — 기록 없음');
    expect(page).not.toContain('요청과 다른 모델');
  });
});

describe('answer source', () => {
  it('says a replay run has no model calls and is not model performance', () => {
    const page = html(resultsRepository(), 'replay-golden');

    expect(page).toContain('실제 모델 호출 없음');
    expect(page).toContain('아래 지표는 파일에 적힌 예측을 채점한 값이고 모델 성능 아님');
    expect(page).toContain('기록 재채점');
    expect(page).not.toContain('실제 모델 호출</span>');
  });

  it('labels a baseline as a rule, not a model', () => {
    const r = resultsRepository();
    r.copyRun('replay-golden', 'rule');
    r.edit('rule/metadata.json', (m) => {
      m.mode = 'live';
      m.controls = { ...(m.controls as Json), allowApi: false, callBudget: 0 };
      const [v] = m.variants as Json[];
      Object.assign(v, { adapter: 'baseline', provider: 'none', model: 'always-other' });
    });
    r.edit('rule/summary.json', (s) => {
      s.mode = 'live';
      const v = variantOf(s);
      Object.assign(v.variant as Json, {
        adapter: 'baseline',
        provider: 'none',
        model: 'always-other',
      });
      v.models = { answered: { 'always-other': 2 }, unknown: 0, different: 0 };
    });
    editCases(r, 'rule', (line) => {
      line.mode = 'live';
    });
    const page = html(r, 'rule');

    expect(page).toContain('규칙 기준선');
    expect(page).toContain('모델 없는 규칙이 낸 답');
    expect(page).toContain('답한 모델 — 없음. 모델 없이 규칙이 답함 (2번)');
    expect(page).not.toContain('답한 모델: always-other');
  });
});
