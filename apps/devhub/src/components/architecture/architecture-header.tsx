import { VIEW_ICON } from '../view-icons';
import { WorkspaceHeader } from '../workspace';

/** Workspace header of the architecture view, with or without a node selected. */
export function ArchitectureHeader() {
  return <WorkspaceHeader eyebrow="아키텍처" icon={VIEW_ICON.architecture} title="현재 구조" />;
}
