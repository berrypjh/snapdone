import { Suspense } from 'react';
import Link from 'next/link';

import {
  Empty,
  Facts,
  Icon,
  Inspector as SharedInspector,
  InspectorHeader,
  InspectorSection,
  type InspectorSectionMeta,
  Pager,
} from '@berrypjh/devhub-ui';

import { swaggerDocument } from '@/data/apis';
import type { ApiRef, TestRef } from '@/domain/model';
import { pagerOf } from '@/lib/browser/pager';
import type {
  Fact,
  Inspection,
  NodeOrder,
  RelatedGroup,
  ResolvedDocument,
} from '@/lib/catalog/inspection';
import { CONSTRAINT } from '@/lib/catalog/labels';
import {
  countByProject,
  countByRunner,
  type FileGroup,
  fileOf,
  groupSources,
  groupTests,
  type ProjectGroup,
} from '@/lib/catalog/reference-groups';

import { NodePager } from '../architecture/node-pager';
import { detailsHref } from '../shell/workspace';
import { ByProject, FileRow } from '../source/file-row';

import { StatusChip } from './status-chip';

const OVERVIEW: InspectorSectionMeta = {
  id: 'inspector-overview',
  title: '개요',
  icon: 'overview',
};
const SOURCE: InspectorSectionMeta = { id: 'inspector-source', title: '소스', icon: 'source' };
const DOCS: InspectorSectionMeta = { id: 'inspector-docs', title: '문서', icon: 'document' };
const TESTS: InspectorSectionMeta = { id: 'inspector-tests', title: '테스트', icon: 'test' };
const API_SECTION: InspectorSectionMeta = { id: 'inspector-apis', title: 'API', icon: 'api' };
const RELATED_SECTION: InspectorSectionMeta = {
  id: 'inspector-related',
  title: '연결',
  icon: 'related',
};

/**
 * 이전 · 다음 아키텍처 구성 요소. 종류 필터는 클라이언트에서 URL로 읽으므로 static fallback은
 * 전체를 대상으로 넘긴다.
 */
function NodePagerSlot({ order }: { order: NodeOrder }) {
  const all = pagerOf('구성 요소', order.nodes, order.current);
  return (
    <Suspense fallback={all && <Pager {...all} />}>
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

function SourceList({ groups }: { groups: ProjectGroup<FileGroup>[] }) {
  return (
    <ByProject
      groups={groups}
      row={(file) => <FileRow key={file.path} file={file} symbols={file.symbols} />}
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
            <FileRow
              file={fileOf(api.handler.path)}
              label="handler"
              symbols={api.handler.symbol ? [api.handler.symbol] : []}
            />
            {api.exposure === 'always' ? (
              <FileRow file={fileOf(swaggerDocument.path)} label="Swagger" />
            ) : (
              <li className="typo-caption-small text-text-light">
                개발 환경 전용 route라 Swagger 문서에 없음
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

/**
 * 오른쪽 창. 선택한 항목의 근거를 언제나 같은 네 구획으로 보인다. 소스와 테스트는 프로젝트 ·
 * 파일로 묶어서 파일과 그 동작이 한 번만 나오게 한다.
 */
export function Inspector({ inspection }: { inspection?: Inspection }) {
  const sources = groupSources(inspection?.source ?? []);
  return (
    <SharedInspector>
      {inspection && (
        <div className="flex flex-col divide-y divide-stroke-light">
          <InspectorHeader
            kind={inspection.kind}
            title={inspection.title}
            pager={
              inspection.pager ? (
                <Pager {...inspection.pager} />
              ) : (
                inspection.nodeOrder && <NodePagerSlot order={inspection.nodeOrder} />
              )
            }
            sections={[
              OVERVIEW,
              SOURCE,
              DOCS,
              TESTS,
              ...(inspection.apis?.length ? [API_SECTION] : []),
              ...(inspection.related ? [RELATED_SECTION] : []),
            ]}
          >
            {inspection.status && <StatusChip status={inspection.status} />}
          </InspectorHeader>

          <InspectorSection {...OVERVIEW}>
            <Facts
              facts={inspection.facts.map((fact) => ({
                term: fact.term,
                details: fact.details.map((detail, index) => (
                  <Detail key={index} detail={detail} />
                )),
              }))}
            />
          </InspectorSection>
          <InspectorSection
            {...SOURCE}
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
          <InspectorSection {...DOCS} count={inspection.docs.length}>
            {inspection.docs.length ? (
              <DocumentList docs={inspection.docs} />
            ) : (
              <Empty reason={inspection.docsEmpty} />
            )}
          </InspectorSection>
          <InspectorSection
            {...TESTS}
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
            <InspectorSection {...API_SECTION} count={inspection.apis.length}>
              <ApiList apis={inspection.apis} />
            </InspectorSection>
          )}
          {inspection.related && (
            <InspectorSection {...RELATED_SECTION}>
              <RelatedGroups groups={inspection.related} />
            </InspectorSection>
          )}
        </div>
      )}
    </SharedInspector>
  );
}
