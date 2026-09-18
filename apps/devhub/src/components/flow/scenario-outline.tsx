import Link from 'next/link';

import { catalog } from '@/data';
import type { Scenario, ScenarioStep } from '@/domain/model';
import { stepHref } from '@/lib/entities';
import { CONSTRAINT } from '@/lib/labels';
import { countByProject, countByRunner, groupSources, groupTests } from '@/lib/reference-groups';

import { ByProject, FileEntry, Symbols } from '../file-row';
import { Icon } from '../icon';
import { StatusChip } from '../status-chip';
import { Term } from '../term';

const LINK = 'text-text-link underline-offset-2 hover:underline';

const runtimeName = new Map(catalog.runtimes.map((runtime) => [runtime.id, runtime.name]));
const apisById = new Map(catalog.apis.map((api) => [api.id, api]));
const contractsById = new Map(catalog.contracts.map((contract) => [contract.id, contract]));
const testsById = new Map(catalog.tests.map((test) => [test.id, test]));
const scenarioTitle = new Map(catalog.scenarios.map((scenario) => [scenario.id, scenario.title]));

const None = () => <span className="text-text-light">없음</span>;

function StepItem({
  scenario,
  step,
  order,
}: {
  scenario: Scenario;
  step: ScenarioStep;
  order: number;
}) {
  const headingId = `outline-${step.id}`;
  const intentOf = new Map(scenario.steps.map((s, i) => [s.id, `${i + 1}. ${s.intent}`]));
  const sources = groupSources(step.source);
  const tests = step.tests.flatMap((id) => testsById.get(id) ?? []);
  // A single `next` that is the step right below says nothing the list order does not.
  const following = scenario.steps[order]?.id;
  const next = step.next.length === 1 && step.next[0] === following ? [] : step.next;

  return (
    <li>
      <article aria-labelledby={headingId} className="flex flex-col gap-3 py-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-start justify-between gap-3">
            <h3 id={headingId} className="typo-body-small-strong">
              <Link href={stepHref(scenario.id, step.id)} scroll={false} className={LINK}>
                {order}. {step.intent}
              </Link>
            </h3>
            <StatusChip status={step.status} />
          </div>
          <p className="typo-body-small text-text-light">{step.behavior}</p>
        </div>
        <dl className="flex flex-col gap-3">
          <Term icon="runtime" term="실행 위치">
            {runtimeName.get(step.runtime) ?? step.runtime}
          </Term>
          <Term icon="owner" term="담당">
            {step.owner}
          </Term>
          <Term
            icon="source"
            term="소스"
            count={
              sources.length > 1
                ? countByProject(sources, (file) => Math.max(1, file.symbols.length))
                : undefined
            }
          >
            {step.source.length ? (
              <ByProject
                groups={sources}
                row={(file) => (
                  <FileEntry key={file.path} file={file}>
                    <Symbols symbols={file.symbols} />
                  </FileEntry>
                )}
              />
            ) : (
              <None />
            )}
          </Term>
          {step.apis.length > 0 && (
            <Term icon="api" term="API">
              <ul className="flex flex-col gap-1">
                {step.apis.map((id) => {
                  const api = apisById.get(id);
                  return (
                    <li key={id} className="devhub-code">
                      {api ? `${api.method} ${api.path}` : id}
                    </li>
                  );
                })}
              </ul>
            </Term>
          )}
          {step.contracts.length > 0 && (
            <Term icon="contract" term="계약">
              <Symbols symbols={step.contracts.map((id) => contractsById.get(id)?.name ?? id)} />
            </Term>
          )}
          <Term icon="test" term="테스트" count={tests.length ? countByRunner(tests) : undefined}>
            {tests.length ? (
              <ByProject
                groups={groupTests(tests)}
                row={(file) => (
                  <FileEntry key={file.path} file={file}>
                    <p className="flex flex-wrap items-center gap-x-2 typo-caption-small text-text-light">
                      {file.runner}
                      {file.requires.length > 0 && (
                        <span className="inline-flex items-center gap-1 text-text-warning">
                          <Icon name="warning" />
                          {file.requires.map((constraint) => CONSTRAINT[constraint]).join(' · ')}
                        </span>
                      )}
                    </p>
                    <ul className="flex flex-col gap-1">
                      {file.titles.map((title) => (
                        <li key={title}>{title}</li>
                      ))}
                    </ul>
                  </FileEntry>
                )}
              />
            ) : (
              <None />
            )}
          </Term>
          {next.length > 0 && (
            <Term icon="outgoing" term="다음">
              <ul className="flex flex-col gap-1">
                {next.map((id) => (
                  <li key={id}>{intentOf.get(id) ?? id}</li>
                ))}
              </ul>
            </Term>
          )}
          {step.via && step.via.length > 0 && (
            <Term icon="related" term="경유">
              <ul className="flex flex-col gap-1">
                {step.via.map((id) => (
                  <li key={id}>{scenarioTitle.get(id) ?? id}</li>
                ))}
              </ul>
            </Term>
          )}
        </dl>
      </article>
    </li>
  );
}

/**
 * The scenario as a structured list: every step with where it runs, its source, APIs,
 * contracts, and tests — files grouped by project, each file once. Carries what the flow drawing
 * shows, and more, as text.
 */
export function ScenarioOutline({ scenario }: { scenario: Scenario }) {
  return (
    <ol
      aria-label={`${scenario.title} 단계`}
      className="flex flex-col divide-y divide-stroke-light"
    >
      {scenario.steps.map((step, index) => (
        <StepItem key={step.id} scenario={scenario} step={step} order={index + 1} />
      ))}
    </ol>
  );
}
