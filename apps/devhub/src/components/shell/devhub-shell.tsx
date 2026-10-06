import {
  DevHubShell as Shell,
  Explorer,
  type ExplorerGroup,
  type ExplorerSection,
} from '@berrypjh/devhub-ui';
import type { ReactNode } from 'react';

import { catalog } from '@/data';
import { entityHref, type Section, sectionHref, SECTIONS, VIEWS } from '@/lib/catalog/entities';
import { TASKS } from '@/lib/evaluations/contract';
import { evalTaskHref } from '@/lib/evaluations/overview';
import { TASK_LABELS } from '@/lib/evaluations/presentation';

import { SnapshotSummary } from '../overview/snapshot-summary';
import { SECTION_ICON, VIEW_ICON } from '../ui/view-icons';

import { GlobalSearch } from './global-search';
import { TopBar } from './top-bar';

/** 탐색기 맨 위의 섹션 없는 보기(개요 · 아키텍처). */
const EXPLORER_VIEWS = VIEWS.map((view) => ({
  id: view.id,
  label: view.label,
  href: view.path,
  icon: VIEW_ICON[view.id],
}));

/**
 * 묶음(`group`)이 있는 섹션은 묶음마다 접고 펴는 제목을 단다. 순서는 카탈로그에서 온 그대로다.
 * 문서는 경로라 글자 그대로 보이고, 접힌 채로 시작해 현재 문서가 든 묶음만 펼친다.
 */
const groupsOf = (section: Section): ExplorerGroup[] => {
  const code = section.id === 'documents';
  const collapsed = section.id === 'documents';
  const items = (entities: Section['entities']) =>
    entities.map((entity) => ({
      id: entity.id,
      label: entity.label,
      href: entityHref(entity),
      code,
    }));
  const groups = [...new Set(section.entities.map((entity) => entity.group))];
  if (groups.length === 1 && groups[0] === undefined) return [{ items: items(section.entities) }];
  return groups.map((title) => ({
    title,
    collapsed,
    items: items(section.entities.filter((entity) => entity.group === title)),
  }));
};

/** 평가 과제는 dataset과 무관한 고정 목록이라 결과 파일을 읽지 않고 만든다. */
const EVALS_SECTION: ExplorerSection = {
  id: 'evals',
  title: '평가',
  href: '/evals',
  icon: VIEW_ICON.evals,
  groups: [
    {
      items: TASKS.map((task) => ({
        id: task,
        label: TASK_LABELS[task],
        href: evalTaskHref(task),
      })),
    },
  ],
};

const EXPLORER_SECTIONS: ExplorerSection[] = [
  EVALS_SECTION,
  ...SECTIONS.map((section) => ({
    id: section.id,
    title: section.title,
    href: sectionHref(section.id),
    icon: SECTION_ICON[section.id],
    groups: groupsOf(section),
  })),
];

/**
 * 이 저장소의 셸: 카탈로그에서 유도한 보기 · 섹션 · 항목(`lib/catalog/entities.ts`)을 devhub-ui 의 셸에 넘긴다.
 * 탐색기는 라우터 위치로 현재 항목을 정한다. `children` 은 `<main>`, `inspector` 는 오른쪽 `<aside>` 다.
 */
export const DevHubShell = ({
  children,
  inspector,
}: {
  children: ReactNode;
  inspector: ReactNode;
}) => (
  <Shell
    topBar={
      <TopBar
        summary={
          <>
            <span className="devhub-code">
              {catalog.repository.owner}/{catalog.repository.name}
            </span>{' '}
            · <SnapshotSummary />
          </>
        }
        search={<GlobalSearch />}
      />
    }
    explorer={<Explorer views={EXPLORER_VIEWS} sections={EXPLORER_SECTIONS} />}
  >
    {children}
    {inspector}
  </Shell>
);
