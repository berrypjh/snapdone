import type { SectionId } from '@/lib/entities';

import type { IconName } from './icon';

/**
 * 이동해 가는 곳마다 아이콘 하나. 그 곳을 부르는 자리(상단 바 · 탐색기 · 작업 영역 `eyebrow`)
 * 모두에서 써서 같은 모양이 어디서나 같은 곳을 뜻하게 한다.
 */
export const SECTION_ICON: Record<SectionId, IconName> = {
  scenarios: 'scenario',
  applications: 'application',
  libraries: 'library',
  documents: 'document',
  records: 'record',
  engineering: 'engineering',
};

/** 아키텍처 구성 요소 종류. 프로젝트는 섹션 아이콘, 저장소 밖 시스템은 지구본. */
export const NODE_KIND_ICON = {
  application: 'application',
  library: 'library',
  external: 'globe',
} as const satisfies Record<string, IconName>;

export const VIEW_ICON = {
  overview: 'home',
  architecture: 'architecture',
  source: 'source',
} as const satisfies Record<string, IconName>;
