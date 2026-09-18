import type { SectionId } from '@/lib/entities';

import type { IconName } from './icon';

/**
 * One icon per place a reader navigates to, used wherever that place is named (top bar, explorer,
 * workspace eyebrow) so the same shape means the same place everywhere.
 */
export const SECTION_ICON: Record<SectionId, IconName> = {
  scenarios: 'scenario',
  applications: 'application',
  libraries: 'library',
  documents: 'document',
  engineering: 'engineering',
};

export const VIEW_ICON = {
  overview: 'home',
  architecture: 'architecture',
  source: 'source',
} as const satisfies Record<string, IconName>;
