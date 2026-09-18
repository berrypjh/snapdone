/** One place in an ordered walk: a scenario step or an architecture node. */
export type PagerItem = { id: string; label: string; href: string };

type PagerLink = { label: string; href: string };

/** The neighbours of the current item in its order. */
export type Pager = { unit: '단계' | '구성 요소'; previous?: PagerLink; next?: PagerLink };

/** The pager for `current` within `items`, or `undefined` when it is not among them. */
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
