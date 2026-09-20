import { catalog } from '../data';
import { commandLine } from '../domain/links';

import { architectureHref, nodeLabel } from './architecture';
import { commandHref, entityHref, stepHref } from './entities';
import { RECORD_KIND } from './labels';
import { sourceHref, sourceUsage } from './source-usage';

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
  | 'test'
  | 'command';

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
  command: '명령',
};

const KIND_ORDER = Object.keys(KIND_LABEL) as SearchKind[];

export type SearchEntry = {
  key: string;
  kind: SearchKind;
  label: string;
  detail: string;
  href: string;
  /** 정확히 또는 앞부분으로 맞춰 보는 값. id · 제목 · 경로다. */
  names: string[];
  /** 낱말이나 부분 문자열로 맞춰 보는 값. */
  text: string[];
  /** 마지막 수단으로만 맞춰 보는 값. 이 항목을 인용한 쪽의 낱말이다. */
  related: string[];
};

export type SearchResult = SearchEntry & { tier: number };

export const normalize = (value: string) => value.normalize('NFC').toLowerCase().trim();

/** 값의 낱말들. camelCase와 경로 구분자에서도 자른다 (`webHandoff` → web, handoff). */
export const tokensOf = (value: string) => {
  const spaced = value.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return [
    ...new Set([
      ...normalize(value).split(/[^\p{L}\p{N}]+/u),
      ...normalize(spaced).split(/[^\p{L}\p{N}]+/u),
    ]),
  ].filter(Boolean);
};

const basename = (path: string) => path.split('/').pop() ?? path;
const stem = (path: string) => basename(path).replace(/\.[^.]+$/, '');

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

  for (const command of catalog.commands) {
    add({
      key: `command:${command.id}`,
      kind: 'command',
      label: commandLine(command),
      detail: command.summary,
      href: commandHref(command),
      names: [
        command.id,
        commandLine(command),
        command.source.kind === 'package-script' ? command.source.script : command.source.target,
      ],
      text: [command.summary],
    });
  }
  return list;
};

type Prepared = SearchEntry & {
  n: string[];
  segments: string[];
  tokens: string[];
  t: string[];
  r: string[];
  rTokens: string[];
};

const prepare = (entry: SearchEntry): Prepared => {
  const n = entry.names.map(normalize);
  return {
    ...entry,
    n,
    segments: n.flatMap((name) => name.split(/[/.-]/)).filter(Boolean),
    tokens: [...new Set([...entry.names, ...entry.text].flatMap(tokensOf))],
    t: entry.text.map(normalize),
    r: entry.related.map(normalize),
    rTokens: [...new Set(entry.related.flatMap(tokensOf))],
  };
};

/**
 * 0 이름이 정확히 일치 · 1 이름 · 경로 조각 · 낱말의 앞부분 · 2 질의의 모든 낱말이 여기 낱말 ·
 * 3 부분 문자열 · 4 인용한 쪽을 통해서만 · null 일치 없음.
 */
export const tierOf = (entry: Prepared, query: string, words: string[]): number | null => {
  if (entry.n.includes(query)) return 0;
  if (
    entry.n.some((name) => name.startsWith(query)) ||
    entry.segments.some((segment) => segment.startsWith(query))
  ) {
    return 1;
  }
  const hasWord = (tokens: string[]) => (word: string) =>
    tokens.some((token) => token === word || token.startsWith(word));
  if (words.length > 0 && words.every(hasWord(entry.tokens))) return 2;
  if ([...entry.n, ...entry.t].some((value) => value.includes(query))) return 3;
  if (
    entry.r.some((value) => value.includes(query)) ||
    (words.length > 0 && words.every(hasWord(entry.rTokens)))
  ) {
    return 4;
  }
  return null;
};

export type SearchIndex = Prepared[];

export const buildSearchIndex = (): SearchIndex => entries().map(prepare);

/** 순위를 매긴 결과. 등급 · 종류 순서 · 짧은 이름 · 이름 순으로 정렬한다. */
export const search = (index: SearchIndex, raw: string): SearchResult[] => {
  const query = normalize(raw);
  if (!query) return [];
  const words = tokensOf(raw);
  return index
    .flatMap((entry) => {
      const tier = tierOf(entry, query, words);
      return tier === null ? [] : [{ entry, tier }];
    })
    .sort(
      (a, b) =>
        a.tier - b.tier ||
        KIND_ORDER.indexOf(a.entry.kind) - KIND_ORDER.indexOf(b.entry.kind) ||
        a.entry.label.length - b.entry.label.length ||
        a.entry.label.localeCompare(b.entry.label),
    )
    .map(({ entry, tier }) => ({
      key: entry.key,
      kind: entry.kind,
      label: entry.label,
      detail: entry.detail,
      href: entry.href,
      names: entry.names,
      text: entry.text,
      related: entry.related,
      tier,
    }));
};

/**
 * 결과 목록에 보이는 것. 순위는 그대로 두고 종류마다 `perKind`개까지만 남겨서,
 * 한 번의 질의가 파일 서른 개 대신 시나리오 · 소스 · 문서 · 테스트에 두루 닿게 한다.
 */
export const topResults = (results: SearchResult[], perKind = 5, limit = 30): SearchResult[] => {
  const seen = new Map<SearchKind, number>();
  return results
    .filter((result) => {
      const count = seen.get(result.kind) ?? 0;
      seen.set(result.kind, count + 1);
      return count < perKind;
    })
    .slice(0, limit);
};
