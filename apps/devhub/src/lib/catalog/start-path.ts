import { slug } from '@berrypjh/devhub-ui';

import { catalog } from '../../data';
import type { DocumentLink, Scenario } from '../../domain/model';

import { entityHref } from './entities';

/**
 * 처음 온 개발자가 차례로 여는 세 단계. 대상은 모두 카탈로그 항목이고 여기서는 순서와 한 줄 안내만 둔다.
 * 사실(제목 · 요약 · 경계)은 카탈로그에서 그때 읽고, 없는 id · 제목은 `start-path.spec.ts`가 잡는다.
 */

/** 제품 loop 전체를 한 장으로 보는 시나리오. 단계가 `via`로 가리키는 시나리오가 그 단계의 상세다. */
export const JOURNEY_ID = 'finish-task-from-image';

export type StartLink = { label: string; href: string; detail?: string };

export type StartStep = { title: string; lead: string; links: StartLink[] };

/** 문서 안 제목으로 가는 링크. 앵커는 문서 페이지의 heading id 규칙(`slug`)과 같다. */
export const documentHref = ({ document, heading }: DocumentLink) => {
  const base = entityHref({ section: 'documents', id: document });
  return heading ? `${base}#${slug(heading)}` : base;
};

/** 세 단계가 여는 문서 제목. 글자 그대로 문서에 있어야 한다(spec이 대조). */
export const START_DOCS = {
  loop: { document: 'product-principles', heading: '핵심 UX loop' },
  runtimeContract: { document: 'target-architecture', heading: '런타임 계약' },
  run: { document: 'local-development', heading: '실행' },
  check: { document: 'local-development', heading: '검사' },
  beforePr: { document: 'quality-gates', heading: 'PR 올리기 전에' },
} satisfies Record<string, DocumentLink>;

const scenarioById = new Map(catalog.scenarios.map((scenario) => [scenario.id, scenario]));

const scenarioLink = (scenario: Scenario, detail?: string): StartLink => ({
  label: scenario.title,
  href: entityHref({ section: 'scenarios', id: scenario.id }),
  detail,
});

/** 상위 시나리오의 단계가 `via`로 넘긴 상세 시나리오. 단계 순서대로, 한 번씩. */
export const detailScenarios = (journey: Scenario): Scenario[] =>
  [...new Set(journey.steps.flatMap((step) => step.via ?? []))].flatMap((id) => {
    const scenario = scenarioById.get(id);
    return scenario ? [scenario] : [];
  });

const titleOf = (link: DocumentLink) =>
  catalog.documents.find((doc) => doc.id === link.document)?.title ?? link.document;

const docLink = (link: DocumentLink, detail?: string): StartLink => ({
  label: `${titleOf(link)} § ${link.heading}`,
  href: documentHref(link),
  detail,
});

export const startPath = (): StartStep[] => {
  const journey = scenarioById.get(JOURNEY_ID);
  if (!journey) throw new Error(`start path: scenario ${JOURNEY_ID} is not in the catalog`);
  const products = catalog.nodes.filter(
    (node) => node.kind === 'application' && node.role === 'product',
  );
  const libraries = catalog.nodes.filter((node) => node.kind === 'library');

  return [
    {
      title: '제품이 하는 일과 대표 흐름',
      lead: `${journey.title}가 loop 전체를 한 장으로 보임. 단계별 화면 · API 상세는 그 단계가 가리키는 시나리오에 있음`,
      links: [
        docLink(START_DOCS.loop, '제품이 끝내 주는 일의 정의'),
        scenarioLink(journey, `상위 흐름 · ${journey.steps.length}단계`),
        ...detailScenarios(journey).map((scenario) => scenarioLink(scenario, '단계 상세')),
      ],
    },
    {
      title: '앱 · API · 공유 라이브러리의 책임',
      lead: '구성 요소마다 맡은 일과, 코드로 참조하지 않고 URL · 계약으로만 만나는 선(경계)',
      links: [
        ...products.map((node) => ({
          label: node.id,
          href: entityHref({ section: 'applications', id: node.id }),
          detail: node.summary,
        })),
        {
          label: `라이브러리 ${libraries.length}개`,
          href: '/libraries',
          detail: '앱 사이 wire 타입 · 메시지 계약',
        },
        ...catalog.boundaries.map((boundary) => ({
          label: boundary.name,
          href: `/architecture#boundary-${boundary.id}`,
          detail: '아키텍처 보기의 경계 설명',
        })),
        docLink(START_DOCS.runtimeContract),
      ],
    },
    {
      title: '로컬 실행과 첫 품질 gate',
      lead: '요구 도구 · 설치 · 명령은 문서가 정본. 첫 PR 전에 돌리는 묶음까지',
      links: [
        docLink(START_DOCS.run, 'web · api · devhub를 띄우는 순서'),
        docLink(START_DOCS.check, 'lint · typecheck · test를 따로 돌리는 법'),
        docLink(START_DOCS.beforePr, 'PR 전에 돌리는 묶음'),
      ],
    },
  ];
};
