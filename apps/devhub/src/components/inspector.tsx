import { type ReactNode, Suspense } from 'react';
import Link from 'next/link';

import { swaggerDocument } from '@/data/apis';
import type { ApiRef, TestRef } from '@/domain/model';
import type { Fact, Inspection, NodeOrder, RelatedGroup, ResolvedDocument } from '@/lib/inspection';
import { CONSTRAINT } from '@/lib/labels';
import { pagerOf } from '@/lib/pager';
import {
  countByProject,
  countByRunner,
  type FileGroup,
  fileOf,
  groupSources,
  groupTests,
  type ProjectGroup,
} from '@/lib/reference-groups';

import { NodePager } from './architecture/node-pager';
import { ByProject, FileRow, Symbols } from './file-row';
import { Icon, type IconName } from './icon';
import { Pager } from './pager';
import { StatusChip } from './status-chip';
import { detailsHref, INSPECTOR_ID } from './workspace';

type SectionMeta = { id: string; title: string; icon: IconName };

const OVERVIEW: SectionMeta = { id: 'inspector-overview', title: '개요', icon: 'overview' };
const SOURCE: SectionMeta = { id: 'inspector-source', title: '소스', icon: 'source' };
const DOCS: SectionMeta = { id: 'inspector-docs', title: '문서', icon: 'document' };
const TESTS: SectionMeta = { id: 'inspector-tests', title: '테스트', icon: 'test' };
const API_SECTION: SectionMeta = { id: 'inspector-apis', title: 'API', icon: 'api' };
const RELATED_SECTION: SectionMeta = { id: 'inspector-related', title: '연결', icon: 'related' };

/**
 * 이전 · 다음 아키텍처 구성 요소. 종류 필터는 클라이언트에서 URL로 읽으므로 static fallback은
 * 전체를 대상으로 넘긴다.
 */
function NodePagerSlot({ order }: { order: NodeOrder }) {
  const all = pagerOf('구성 요소', order.nodes, order.current);
  return (
    <Suspense fallback={all && <Pager pager={all} />}>
      <NodePager order={order} />
    </Suspense>
  );
}

/** 사실의 세부 항목. 글이거나, 다른 항목의 상세를 여는 링크다. */
function Detail({ detail }: { detail: Fact['details'][number] }) {
  if (typeof detail === 'string') return detail;
  return (
    <Link
      href={detailsHref(detail.href)}
      className="text-text-link underline-offset-2 hover:underline"
    >
      {detail.label}
    </Link>
  );
}

function InspectorSection({
  meta,
  count,
  summary,
  children,
}: {
  meta: SectionMeta;
  count?: number;
  /** 목록을 읽기 전에 무엇이 들었는지 알려 주는 한 줄. 예: `web 4 · api 2`. */
  summary?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={`${meta.id}-heading`}
      id={meta.id}
      className="flex flex-col gap-2 py-4 last:pb-0"
    >
      <div className="flex flex-col gap-0.5">
        <h3 id={`${meta.id}-heading`} className="flex items-center gap-2 typo-body-small-strong">
          <Icon name={meta.icon} className="text-text-light" />
          {meta.title}
          {count !== undefined && (
            <span className="typo-caption-small text-text-light">{count}</span>
          )}
        </h3>
        {summary && <p className="pl-6 typo-caption-small text-text-light">{summary}</p>}
      </div>
      {children}
    </section>
  );
}

function Empty({ reason }: { reason: string }) {
  return <p className="typo-caption-small text-text-light">없음 — {reason}</p>;
}

/** 내용이 있는 사실만 보인다. 빈 사실은 근거가 아니라 잡음이다. */
function Facts({ facts }: { facts: Fact[] }) {
  return (
    <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-2">
      {facts
        .filter((fact) => fact.details.length > 0)
        .map((fact) => (
          <div key={fact.term} className="contents">
            <dt className="typo-caption-small text-text-light">{fact.term}</dt>
            <dd className="typo-body-small">
              <ul className="flex flex-col gap-1">
                {fact.details.map((detail, index) => (
                  <li key={index}>
                    <Detail detail={detail} />
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        ))}
    </dl>
  );
}

function SourceList({ groups }: { groups: ProjectGroup<FileGroup>[] }) {
  return (
    <ByProject
      groups={groups}
      row={(file) => (
        <FileRow key={file.path} file={file}>
          <Symbols symbols={file.symbols} />
        </FileRow>
      )}
    />
  );
}

function DocumentList({ docs }: { docs: ResolvedDocument[] }) {
  const byPath = new Map<string, { title: string; headings: string[] }>();
  for (const { document, heading } of docs) {
    const entry = byPath.get(document.path) ?? { title: document.title, headings: [] };
    if (heading) entry.headings.push(heading);
    byPath.set(document.path, entry);
  }
  return (
    <ul className="flex flex-col gap-3">
      {[...byPath].map(([path, { title, headings }]) => (
        <FileRow key={path} file={fileOf(path)}>
          <ul className="flex flex-col gap-0.5 typo-caption-small">
            {(headings.length ? headings.map((heading) => `§ ${heading}`) : [title]).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </FileRow>
      ))}
    </ul>
  );
}

function TestList({ tests }: { tests: TestRef[] }) {
  return (
    <ByProject
      groups={groupTests(tests)}
      row={(file) => (
        <FileRow key={file.path} file={file}>
          <p className="flex flex-wrap items-center gap-x-2 typo-caption-small text-text-light">
            {file.runner}
            {file.requires.length > 0 && (
              <span className="inline-flex items-center gap-1 text-text-warning">
                <Icon name="warning" />
                {file.requires.map((constraint) => CONSTRAINT[constraint]).join(' · ')}
              </span>
            )}
          </p>
          <ul className="flex flex-col gap-1 typo-body-small">
            {file.titles.map((title) => (
              <li key={title}>{title}</li>
            ))}
          </ul>
        </FileRow>
      )}
    />
  );
}

function ApiList({ apis }: { apis: ApiRef[] }) {
  return (
    <ul className="flex flex-col gap-4">
      {apis.map((api) => (
        <li key={api.id} className="flex flex-col gap-2">
          <p className="devhub-code typo-body-small-strong">
            {api.method} {api.path}
            {api.alsoHead && ' (+HEAD)'}
          </p>
          <ul className="flex flex-col gap-3 border-l border-stroke-light pl-3">
            <FileRow file={fileOf(api.handler.path)} label="handler">
              <Symbols symbols={api.handler.symbol ? [api.handler.symbol] : []} />
            </FileRow>
            {api.exposure === 'always' ? (
              <FileRow file={fileOf(swaggerDocument.path)} label="Swagger" />
            ) : (
              <li className="typo-caption-small text-text-light">
                개발 환경 전용 route라 Swagger 문서에 없습니다
              </li>
            )}
          </ul>
        </li>
      ))}
    </ul>
  );
}

function RelatedGroups({ groups }: { groups: RelatedGroup[] }) {
  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) => (
        <div key={group.title} className="flex flex-col gap-1">
          <p className="typo-caption-small text-text-light">{group.title}</p>
          {group.links.length ? (
            <ul className="flex flex-col gap-1">
              {group.links.map((link) => (
                <li key={link.href} className="flex flex-col">
                  <Link
                    href={link.href}
                    className="typo-body-small text-text-link underline-offset-2 hover:underline"
                  >
                    {link.label}
                  </Link>
                  {link.detail && (
                    <span className="typo-caption-small text-text-light">{link.detail}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <Empty reason={group.empty} />
          )}
        </div>
      ))}
    </div>
  );
}

function Contents({ apis, related }: { apis: boolean; related: boolean }) {
  const sections = [
    OVERVIEW,
    SOURCE,
    DOCS,
    TESTS,
    ...(apis ? [API_SECTION] : []),
    ...(related ? [RELATED_SECTION] : []),
  ];
  return (
    <nav aria-label="상세 목차">
      <ul className="flex flex-wrap gap-x-3 gap-y-1">
        {sections.map((section) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              className="inline-flex items-center gap-1 typo-caption-small text-text-link underline-offset-2 hover:underline"
            >
              <Icon name={section.icon} />
              {section.title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * 오른쪽 창. 선택한 항목의 근거를 언제나 같은 네 구획으로 보인다. 소스와 테스트는 프로젝트 ·
 * 파일로 묶어서 파일과 그 동작이 한 번만 나오게 한다.
 */
export function Inspector({ inspection }: { inspection?: Inspection }) {
  const sources = groupSources(inspection?.source ?? []);
  return (
    <aside
      id={INSPECTOR_ID}
      tabIndex={-1}
      aria-label="상세 정보"
      className="relative border-t border-stroke-light bg-background-surface lg:overflow-y-auto lg:border-t-0 lg:border-l"
    >
      {inspection ? (
        <div className="flex flex-col divide-y divide-stroke-light p-4 pb-12">
          <header className="flex flex-col gap-2 pb-4">
            {/* 화살표는 첫 줄 끝에 둔다. 이웃으로 이동하면 도착하는 자리다. */}
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 typo-caption-small text-text-light">{inspection.kind}</p>
              {inspection.pager && <Pager pager={inspection.pager} />}
              {inspection.nodeOrder && <NodePagerSlot order={inspection.nodeOrder} />}
            </div>
            <h2 className="typo-body-medium-strong">{inspection.title}</h2>
            {inspection.status && <StatusChip status={inspection.status} />}
            <Contents apis={!!inspection.apis?.length} related={!!inspection.related} />
          </header>

          <InspectorSection meta={OVERVIEW}>
            <Facts facts={inspection.facts} />
          </InspectorSection>
          <InspectorSection
            meta={SOURCE}
            count={inspection.source.length}
            summary={
              sources.length > 1
                ? countByProject(sources, (file) => Math.max(1, file.symbols.length))
                : undefined
            }
          >
            {inspection.source.length ? (
              <SourceList groups={sources} />
            ) : (
              <Empty reason={inspection.sourceEmpty} />
            )}
          </InspectorSection>
          <InspectorSection meta={DOCS} count={inspection.docs.length}>
            {inspection.docs.length ? (
              <DocumentList docs={inspection.docs} />
            ) : (
              <Empty reason={inspection.docsEmpty} />
            )}
          </InspectorSection>
          <InspectorSection
            meta={TESTS}
            count={inspection.tests.length}
            summary={countByRunner(inspection.tests)}
          >
            {inspection.tests.length ? (
              <TestList tests={inspection.tests} />
            ) : (
              <Empty reason={inspection.testsEmpty} />
            )}
          </InspectorSection>
          {inspection.apis && inspection.apis.length > 0 && (
            <InspectorSection meta={API_SECTION} count={inspection.apis.length}>
              <ApiList apis={inspection.apis} />
            </InspectorSection>
          )}
          {inspection.related && (
            <InspectorSection meta={RELATED_SECTION}>
              <RelatedGroups groups={inspection.related} />
            </InspectorSection>
          )}
        </div>
      ) : (
        <p className="p-4 typo-body-small text-text-light">
          탐색기에서 항목을 고르면 근거가 여기에 나옵니다.
        </p>
      )}
    </aside>
  );
}
