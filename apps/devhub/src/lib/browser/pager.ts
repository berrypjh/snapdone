import type { PagerItem } from '@berrypjh/devhub-ui';

export type { PagerItem };

/** 공용 `Pager`에 넘길 순서. 시나리오 단계나 아키텍처 노드다. */
export type Pager = { unit: '단계' | '구성 요소'; entities: PagerItem[]; current: string };

/** `items` 안에 `current`가 있으면 그 순서, 없으면 `undefined` — 순서 밖 항목에는 넘김을 두지 않는다. */
export const pagerOf = (
  unit: Pager['unit'],
  items: PagerItem[],
  current: string,
): Pager | undefined =>
  items.some((item) => item.id === current) ? { unit, entities: items, current } : undefined;
