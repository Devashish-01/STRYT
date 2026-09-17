import type { Category } from "@/types";

/** Depth-first search for a category by id. Two copies of this walk existed — one exported from
 *  CategoryStrip, one private to CategoryListing — and they behaved identically. */
export function findCategoryNode(tree: Category[], id: string): Category | undefined {
  for (const c of tree) {
    if (c.id === id) return c;
    const found = findCategoryNode(c.children ?? [], id);
    if (found) return found;
  }
  return undefined;
}
