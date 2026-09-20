import { WorkspaceHeader } from '../shell/workspace';
import { VIEW_ICON } from '../ui/view-icons';

/** 아키텍처 화면의 작업 영역 헤더. 구성 요소 선택 여부와 상관없이 같다. */
export function ArchitectureHeader() {
  return <WorkspaceHeader eyebrow="아키텍처" icon={VIEW_ICON.architecture} title="현재 구조" />;
}
