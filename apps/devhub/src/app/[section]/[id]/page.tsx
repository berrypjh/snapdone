import { EntityHeader } from '@/components/entity-header';
import { entityParams } from '@/lib/entities';

type Params = Promise<{ section: string; id: string }>;

export const dynamicParams = false;

export const generateStaticParams = entityParams;

/**
 * 항목의 작업 영역 머리말. page segment로 두어야 이동 뒤 Next가 상세 정보(`@inspector` 슬롯)가
 * 아니라 작업 영역 맨 위로 스크롤하고 포커스한다.
 */
export default async function EntityPage({ params }: { params: Params }) {
  const { section, id } = await params;
  return <EntityHeader section={section} id={id} />;
}
