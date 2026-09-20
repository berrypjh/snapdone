/** 차례대로 넘겨 보는 항목 하나. 시나리오 단계나 아키텍처 노드다. */
export type PagerItem = { id: string; label: string; href: string };

type PagerLink = { label: string; href: string };

/** 그 순서 안에서 지금 항목의 앞뒤 이웃. */
export type Pager = { unit: '단계' | '구성 요소'; previous?: PagerLink; next?: PagerLink };

/** `items` 안에서 `current`의 넘김 정보. 목록에 없으면 `undefined`. */
export const pagerOf = (
  unit: Pager['unit'],
  items: PagerItem[],
  current: string,
): Pager | undefined => {
  const index = items.findIndex((item) => item.id === current);
  if (index < 0) return undefined;
  const link = (item: PagerItem | undefined) => item && { label: item.label, href: item.href };
  return { unit, previous: link(items[index - 1]), next: link(items[index + 1]) };
};
