import { ArchitectureHeader } from '@/components/architecture/architecture-header';

/**
 * 아키텍처 작업 영역 머리말. page segment로 두어야 이동 뒤 Next가 상세 정보(`@inspector` 슬롯)가
 * 아니라 작업 영역 맨 위로 스크롤하고 포커스한다.
 */
export default function ArchitecturePage() {
  return <ArchitectureHeader />;
}
