import type { Category } from "@/types";

/**
 * Ranking the Home nearby rail by the interests captured during onboarding.
 *
 * Interests are stored as TOP-LEVEL category ids ("Food & Beverage"), but a
 * listing carries the leaf it was filed under ("Restaurant"), so matching one
 * against the other needs the leaf's parent. `buildParentMap` reads that from
 * the real category tree Home already loads — deliberately not from the id
 * naming convention (`c-food-rest` starting with `c-food`), which happens to
 * hold today and would break silently the first time a category is added with
 * a different id shape.
 */

/** Maps every category id — leaf or top-level — to its top-level ancestor. */
export function buildParentMap(tree: Category[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const top of tree) {
    map[top.id] = top.id;
    for (const child of top.children ?? []) {
      map[child.id] = top.id;
      // Defensive: the taxonomy is two levels today, but a third would
      // otherwise silently rank as "no match" rather than rolling up.
      for (const grand of child.children ?? []) map[grand.id] = top.id;
    }
  }
  return map;
}

/**
 * Stable partition: listings matching an interest first, everything else after,
 * each group keeping the order it arrived in (distance).
 *
 * A partition rather than a filter — this must never hide a nearby listing
 * just because its category wasn't picked. With no interests it returns the
 * input untouched, which is what keeps Home identical for every user who
 * onboarded before this existed.
 */
export function rankByInterests<T extends { categoryId?: string | null }>(
  items: T[],
  interestIds: string[] | null | undefined,
  parentOf: Record<string, string>
): T[] {
  if (!interestIds || interestIds.length === 0) return items;
  const wanted = new Set(interestIds);
  const matched: T[] = [];
  const rest: T[] = [];
  for (const item of items) {
    const top = item.categoryId ? parentOf[item.categoryId] : undefined;
    (top && wanted.has(top) ? matched : rest).push(item);
  }
  return matched.concat(rest);
}
