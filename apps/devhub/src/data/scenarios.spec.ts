import { describe, expect, it } from 'vitest';

import { isCanonicalPath } from '../domain/links';
import type { ImplementationStatus, Scenario, ScenarioStep } from '../domain/model';
import {
  exists,
  filesUnder,
  headingPattern,
  read,
  symbolPattern,
} from '../test-support/repository-files';

import { catalog } from './index';

/** 시나리오 추적을 검사한다: 참조가 풀리는지, 상태가 근거를 따르는지, 부재가 유지되는지. */

const ids = (items: { id: string }[]) => new Set(items.map((item) => item.id));
const scenarioIds = ids(catalog.scenarios);
const nodeIds = ids(catalog.nodes);
const runtimeIds = ids(catalog.runtimes);
const apiIds = ids(catalog.apis);
const contractIds = ids(catalog.contracts);
const testIds = ids(catalog.tests);
const documentPath = new Map(catalog.documents.map((doc) => [doc.id, doc.path]));

const allSteps = catalog.scenarios.flatMap((scenario) =>
  scenario.steps.map((step) => ({ scenario, step })),
);

const CURRENT: ImplementationStatus[] = ['implemented', 'partial'];
const TARGET: ImplementationStatus[] = ['documented-only', 'planned', 'not-found'];
const hasCode = (step: ScenarioStep) => CURRENT.includes(step.status);

describe('scenario structure', () => {
  it('uses unique step ids within each scenario', () => {
    for (const { steps } of catalog.scenarios) {
      expect(new Set(steps.map((step) => step.id)).size).toBe(steps.length);
    }
  });

  it('links next steps inside the same scenario and via-scenarios that exist', () => {
    for (const { scenario, step } of allSteps) {
      const stepIds = scenario.steps.map((s) => s.id);
      expect(step.next.filter((id) => !stepIds.includes(id) || id === step.id)).toEqual([]);
      expect((step.via ?? []).filter((id) => !scenarioIds.has(id) || id === scenario.id)).toEqual(
        [],
      );
    }
  });

  it('points at runtimes, owners, APIs, contracts, tests, and documents that exist', () => {
    const broken = allSteps.flatMap(({ scenario, step }) => {
      const where = `${scenario.id}/${step.id}`;
      return [
        ...(runtimeIds.has(step.runtime) ? [] : [`${where} runtime ${step.runtime}`]),
        ...(nodeIds.has(step.owner) ? [] : [`${where} owner ${step.owner}`]),
        ...step.apis.filter((id) => !apiIds.has(id)).map((id) => `${where} api ${id}`),
        ...step.contracts
          .filter((id) => !contractIds.has(id))
          .map((id) => `${where} contract ${id}`),
        ...step.tests.filter((id) => !testIds.has(id)).map((id) => `${where} test ${id}`),
        ...[...step.docs, ...scenario.docs]
          .filter((link) => !documentPath.has(link.document))
          .map((link) => `${where} document ${link.document}`),
      ];
    });
    const gapTests = catalog.scenarios
      .flatMap((scenario) => [...scenario.gaps, ...scenario.steps.flatMap((s) => s.gaps ?? [])])
      .flatMap((gap) => gap.tests ?? [])
      .filter((id) => !testIds.has(id));
    expect([...broken, ...gapTests]).toEqual([]);
  });

  it('links document headings that exist verbatim', () => {
    const links = catalog.scenarios.flatMap((scenario) => [
      ...scenario.docs,
      ...scenario.steps.flatMap((step) => step.docs),
    ]);
    const missing = links.filter(
      (link) =>
        link.heading &&
        !headingPattern(link.heading).test(read(String(documentPath.get(link.document)))),
    );
    expect(missing).toEqual([]);
  });

  it('cites source paths that exist and symbols written in them', () => {
    const refs = allSteps.flatMap(({ step }) => step.source);
    const bad = refs.filter(
      (ref) =>
        !isCanonicalPath(ref.path) ||
        !exists(ref.path) ||
        (ref.symbol !== undefined && !symbolPattern(ref.symbol).test(read(ref.path))),
    );
    expect(bad).toEqual([]);
  });
});

describe('scenario status', () => {
  it('keeps current scenarios and product targets apart', () => {
    for (const scenario of catalog.scenarios) {
      const allowed = scenario.track === 'current' ? CURRENT : TARGET;
      expect(allowed).toContain(scenario.status);
    }
  });

  it('gives every step the evidence its status claims', () => {
    const wrong = allSteps.flatMap(({ scenario, step }) => {
      const where = `${scenario.id}/${step.id} (${step.status})`;
      const source = step.source.length > 0;
      const absence = (step.absence ?? []).length > 0;
      const docs = step.docs.length > 0;
      const gaps = (step.gaps ?? []).length > 0;
      const ok = {
        implemented: source,
        partial: source && gaps,
        'documented-only': !source && docs && absence,
        planned: !source && docs,
        'not-found': !source && absence,
      }[step.status];
      return ok ? [] : [where];
    });
    expect(wrong).toEqual([]);
  });

  it('derives the scenario status from its steps', () => {
    const expected = (scenario: Scenario): ImplementationStatus => {
      const statuses = scenario.steps.map((step) => step.status);
      if (statuses.every((status) => status === 'implemented')) return 'implemented';
      if (scenario.steps.some(hasCode)) return 'partial';
      if (statuses.includes('documented-only')) return 'documented-only';
      return statuses.includes('planned') ? 'planned' : 'not-found';
    };
    for (const scenario of catalog.scenarios) {
      expect({ id: scenario.id, status: scenario.status }).toEqual({
        id: scenario.id,
        status: expected(scenario),
      });
    }
  });

  it('backs every implemented scenario with at least one test', () => {
    const untested = catalog.scenarios.filter(
      (scenario) =>
        scenario.status === 'implemented' &&
        scenario.steps.every((step) => step.tests.length === 0),
    );
    expect(untested).toEqual([]);
  });

  it('keeps product targets free of source', () => {
    const leaked = catalog.scenarios
      .filter((scenario) => scenario.track === 'product-target')
      .flatMap((scenario) => scenario.steps.filter((step) => step.source.length > 0));
    expect(leaked).toEqual([]);
  });
});

describe('absence checks', () => {
  const checks = allSteps.flatMap(({ scenario, step }) =>
    (step.absence ?? []).map((check) => ({ where: `${scenario.id}/${step.id}`, check })),
  );

  it.each(checks)('hold for $where: $check.meaning', ({ check }) => {
    const hits = check.scope.flatMap((scope) =>
      filesUnder(scope).flatMap((file) => {
        const text = read(file);
        return check.terms
          .filter((term) => text.includes(term))
          .map((term) => `${term} in ${file}`);
      }),
    );
    expect(hits).toEqual([]);
  });
});

describe('tests', () => {
  it('name files, functions, and titles that exist', () => {
    const bad = catalog.tests.filter(({ source, title, runner }) => {
      if (!exists(source.path)) return true;
      const text = read(source.path);
      if (runner === 'go-test') return !new RegExp(`^func ${source.symbol}\\(`, 'm').test(text);
      return (title ?? []).some(
        (part) =>
          ![`'${part}'`, `"${part}"`, `\`${part}\``].some((quoted) => text.includes(quoted)),
      );
    });
    expect(bad).toEqual([]);
  });

  it('are all cited by some scenario or record', () => {
    const cited = new Set([
      ...allSteps.flatMap(({ step }) => step.tests),
      ...catalog.scenarios.flatMap((scenario) => scenario.gaps.flatMap((gap) => gap.tests ?? [])),
      ...catalog.records.flatMap((record) => record.tests),
    ]);
    expect(catalog.tests.filter((test) => !cited.has(test.id)).map((test) => test.id)).toEqual([]);
  });
});
