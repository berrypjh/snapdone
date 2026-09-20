import { catalog } from '../data';
import { swaggerDocument } from '../data/apis';
import type { SourceRef } from '../domain/model';

export type CitedRef = SourceRef & { origin: string };

const cite =
  (origin: string) =>
  (ref: SourceRef): CitedRef => ({ ...ref, origin });

/** 카탈로그가 인용하는 모든 저장소 경로와, 그 경로를 인용한 기록. */
export const citedRefs = (): CitedRef[] => [
  ...catalog.nodes.flatMap((node) =>
    node.kind === 'external'
      ? node.evidence.map(cite(`node ${node.id}`))
      : [cite(`node ${node.id}`)(node.manifest)],
  ),
  ...catalog.apis.map((api) => cite(`api ${api.id}`)(api.handler)),
  cite('swagger')(swaggerDocument),
  ...catalog.contracts.map((contract) => cite(`contract ${contract.id}`)(contract.definedIn)),
  ...catalog.relations.flatMap((relation) =>
    (relation.kind === 'workspace-dependency' ? [relation.evidence] : relation.evidence).map(
      cite(`relation ${relation.id}`),
    ),
  ),
  ...catalog.documents.map((document) => cite(`document ${document.id}`)({ path: document.path })),
  ...catalog.records.flatMap((record) => [
    cite(`record ${record.id}`)({ path: record.path }),
    ...record.sources.map(cite(`record ${record.id}`)),
  ]),
  ...catalog.tests.map((test) => cite(`test ${test.id}`)(test.source)),
  ...catalog.scenarios.flatMap((scenario) =>
    scenario.steps.flatMap((step) => step.source.map(cite(`step ${scenario.id}/${step.id}`))),
  ),
];
