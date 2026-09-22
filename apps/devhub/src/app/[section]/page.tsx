import Link from 'next/link';
import { notFound } from 'next/navigation';

import type { Metadata } from 'next';

import { CommandGroups } from '@/components/engineering/command';
import { FilterBar } from '@/components/entity/filter-bar';
import { Inspector } from '@/components/entity/inspector';
import { RecordList } from '@/components/entity/record-list';
import { SectionSummary } from '@/components/entity/section-summary';
import { DevHubShell } from '@/components/shell/devhub-shell';
import { Workspace, WorkspaceSection } from '@/components/shell/workspace';
import { SECTION_ICON } from '@/components/ui/view-icons';
import { findSection, SECTIONS } from '@/lib/catalog/entities';
import { filterScenarios, parseScenarioFilters, SCENARIO_FILTERS } from '@/lib/catalog/filters';

type Params = Promise<{ section: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const dynamicParams = false;

export const generateStaticParams = () => SECTIONS.map((section) => ({ section: section.id }));

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const section = findSection((await params).section);
  return { title: section ? `${section.title} · Snapdone DevHub` : undefined };
}

export default async function SectionPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const section = findSection((await params).section);
  if (!section) notFound();

  const filterable = section.id === 'scenarios';
  const active = filterable ? parseScenarioFilters(await searchParams) : {};
  const visible = filterable
    ? filterScenarios(
        section.entities.flatMap((entity) =>
          entity.section === 'scenarios' ? [entity.record] : [],
        ),
        active,
      ).map((scenario) => scenario.id)
    : null;
  const entities = visible
    ? section.entities.filter((entity) => visible.includes(entity.id))
    : section.entities;

  return (
    <DevHubShell selection={{ section: section.id }} inspector={<Inspector />}>
      <Workspace eyebrow="섹션" icon={SECTION_ICON[section.id]} title={section.title}>
        {filterable && (
          <FilterBar basePath={`/${section.id}`} groups={SCENARIO_FILTERS} active={active} />
        )}
        {section.id === 'engineering' ? (
          <CommandGroups />
        ) : section.id === 'records' ? (
          <RecordList />
        ) : entities.length > 0 ? (
          <SectionSummary section={{ ...section, entities }} />
        ) : (
          <WorkspaceSection id="section-empty" title="결과 없음">
            <p className="typo-body-small">조건에 맞는 시나리오 없음</p>
            <Link
              href={`/${section.id}`}
              className="typo-body-small text-text-link underline-offset-2 hover:underline"
            >
              필터 모두 해제
            </Link>
          </WorkspaceSection>
        )}
      </Workspace>
    </DevHubShell>
  );
}
