import {
  basename,
  buildIndex,
  type SearchEntry as SharedSearchEntry,
  type SearchIndex as SharedSearchIndex,
  type SearchResult as SharedSearchResult,
  stem,
} from '@berrypjh/devhub-ui';

import { catalog } from '../../data';
import { architectureHref, nodeLabel } from '../catalog/architecture';
import { entityHref, stepHref } from '../catalog/entities';
import { RECORD_KIND } from '../catalog/labels';
import { sourceHref, sourceUsage } from '../repository/source-usage';

/**
 * 카탈로그의 모든 엔티티를 훑는 전체 검색. 색인은 로드할 때 데이터에서 만들어지고
 * 손으로 관리하는 검색 목록은 없다. 순위는 정해진 규칙을 따르며 유사 일치는 쓰지 않는다.
 */

export type SearchKind =
  | 'scenario'
  | 'step'
  | 'application'
  | 'library'
  | 'node'
  | 'concept'
  | 'document'
  | 'record'
  | 'api'
  | 'contract'
  | 'source'
  | 'symbol'
  | 'test';

/** 화면에 보이는 종류 이름. 결과 종류는 색이 아니라 이 글자로 구분한다. */
export const KIND_LABEL: Record<SearchKind, string> = {
  scenario: '시나리오',
  step: '시나리오 단계',
  application: '애플리케이션',
  library: '라이브러리',
  node: '아키텍처 구성 요소',
  concept: '개념',
  document: '문서',
  record: '기록',
  api: 'API',
  contract: '계약',
  source: '소스 파일',
  symbol: 'symbol',
  test: '테스트',
};

const KIND_ORDER = Object.keys(KIND_LABEL) as SearchKind[];

/** 이 저장소의 검색 항목. 순위 규칙은 공용 `buildIndex` · `search`가 갖는다. */
export type SearchEntry = SharedSearchEntry & { kind: SearchKind };
export type SearchResult = SharedSearchResult<SearchEntry>;
export type SearchIndex = SharedSearchIndex<SearchEntry>;

const runtimeName = new Map(catalog.runtimes.map((runtime) => [runtime.id, runtime.name]));

const entries = (): SearchEntry[] => {
  const list: SearchEntry[] = [];
  const add = (entry: Omit<SearchEntry, 'related'> & { related?: string[] }) =>
    list.push({ related: [], ...entry });

  for (const scenario of catalog.scenarios) {
    add({
      key: `scenario:${scenario.id}`,
      kind: 'scenario',
      label: scenario.title,
      detail: scenario.goal,
      href: entityHref({ section: 'scenarios', id: scenario.id }),
      names: [scenario.id, scenario.title],
      text: [scenario.goal],
    });
    for (const step of scenario.steps) {
      add({
        key: `step:${scenario.id}/${step.id}`,
        kind: 'step',
        label: step.intent,
        detail: `${scenario.title} · ${runtimeName.get(step.runtime) ?? step.runtime}`,
        href: stepHref(scenario.id, step.id),
        names: [step.id, step.intent],
        text: [step.behavior, step.owner],
        related: [scenario.id, scenario.title],
      });
    }
  }

  for (const node of catalog.nodes) {
    if (node.kind !== 'external') {
      add({
        key: `${node.kind}:${node.id}`,
        kind: node.kind,
        label: node.id,
        detail: node.root,
        href: entityHref({
          section: node.kind === 'library' ? 'libraries' : 'applications',
          id: node.id,
        }),
        names: [node.id, node.root, node.packageName ?? ''].filter(Boolean),
        text: [node.summary, node.stack],
      });
    }
    add({
      key: `node:${node.id}`,
      kind: 'node',
      label: nodeLabel(node),
      detail: node.summary,
      href: architectureHref(node.id),
      names: [node.id, nodeLabel(node)],
      text: [node.summary],
    });
  }

  for (const boundary of catalog.boundaries) {
    add({
      key: `concept:boundary-${boundary.id}`,
      kind: 'concept',
      label: boundary.name,
      detail: boundary.summary,
      href: `/architecture#boundary-${boundary.id}`,
      names: [boundary.id, boundary.name],
      text: [boundary.summary],
    });
  }
  for (const runtime of catalog.runtimes) {
    add({
      key: `concept:runtime-${runtime.id}`,
      kind: 'concept',
      label: runtime.name,
      detail: `런타임 · ${runtime.summary}`,
      href: `/scenarios?runtime=${runtime.id}`,
      names: [runtime.id, runtime.name],
      text: [runtime.summary],
    });
  }

  for (const doc of catalog.documents) {
    add({
      key: `document:${doc.id}`,
      kind: 'document',
      label: doc.path,
      detail: doc.title,
      href: entityHref({ section: 'documents', id: doc.id }),
      names: [doc.id, doc.path, doc.title, stem(doc.path)],
      text: [doc.topic],
    });
  }

  for (const record of catalog.records) {
    add({
      key: `record:${record.id}`,
      kind: 'record',
      label: record.title,
      detail: `${record.date} · ${RECORD_KIND[record.kind]}`,
      href: entityHref({ section: 'records', id: record.id }),
      names: [record.id, record.path, record.title],
      text: [record.summary, RECORD_KIND[record.kind]],
    });
  }

  for (const api of catalog.apis) {
    add({
      key: `api:${api.id}`,
      kind: 'api',
      label: `${api.method} ${api.path}`,
      detail: `${api.handler.symbol ?? ''} · ${api.handler.path}`,
      href: sourceHref(api.handler.path),
      names: [api.path, `${api.method} ${api.path}`, api.id],
      text: [api.handler.symbol ?? ''],
    });
  }

  for (const contract of catalog.contracts) {
    add({
      key: `contract:${contract.id}`,
      kind: 'contract',
      label: contract.name,
      detail: `${contract.kind} · ${contract.owner}`,
      href: sourceHref(contract.definedIn.path),
      names: [contract.name, contract.id],
      text: [contract.owner, contract.kind],
    });
  }

  for (const usage of sourceUsage().values()) {
    const citing = [
      ...usage.steps.flatMap(({ scenario, step }) => [scenario.id, scenario.title, step.id]),
      ...usage.apis.map((api) => api.path),
      ...usage.contracts.map((contract) => contract.name),
    ];
    add({
      key: `source:${usage.path}`,
      kind: 'source',
      label: usage.path,
      detail: `인용 ${usage.steps.length + usage.relations.length + usage.nodes.length + usage.apis.length + usage.contracts.length + usage.tests.length}곳`,
      href: sourceHref(usage.path),
      names: [usage.path, basename(usage.path), stem(usage.path)],
      text: usage.symbols,
      related: citing,
    });
    for (const symbol of usage.symbols) {
      add({
        key: `symbol:${usage.path}#${symbol}`,
        kind: 'symbol',
        label: symbol,
        detail: usage.path,
        href: sourceHref(usage.path),
        names: [symbol, ...symbol.split('.')],
        text: [usage.path],
        related: citing,
      });
    }
  }

  for (const test of catalog.tests) {
    const title = test.title?.join(' › ') ?? test.source.symbol ?? test.id;
    add({
      key: `test:${test.id}`,
      kind: 'test',
      label: title,
      detail: `${test.runner} · ${test.source.path}`,
      href: sourceHref(test.source.path),
      names: [test.id, test.source.symbol ?? ''].filter(Boolean),
      text: [title, test.source.path],
    });
  }

  return list;
};

/** 번들된 카탈로그의 색인. 종류 순서(`KIND_LABEL`)가 같은 등급 안의 정렬을 정한다. */
export const buildSearchIndex = (): SearchIndex => buildIndex(entries(), KIND_ORDER);
