/**
 * Does a request belong in a responder's (business or provider) inbox, by category?
 *
 * Categories are two levels: a top-level group (`c-home`) and its specialities (`c-home-plumb`). Requests are posted
 * with a top-level group, while shops and providers pick a speciality — so the old exact-id comparison meant a
 * plumber never saw a single "Home & Repair" request (E2E-019). The rule now:
 *   - either side without a category → match (nothing to filter on);
 *   - both specialities → they must be the same speciality;
 *   - otherwise → same top-level group.
 *
 * `parentOf` maps category id → parent id (null for a top-level group), from catalogService.parentMap(). An id missing
 * from the map is treated as top-level, so an unknown category still matches itself.
 */
export type CategoryParents = Record<string, string | null>;

export function categoryRoot(id: string, parentOf: CategoryParents): string {
  return parentOf[id] ?? id;
}

export function requestMatchesCategory(
  requestCategoryId: string | null | undefined,
  responderCategoryId: string | null | undefined,
  parentOf: CategoryParents,
): boolean {
  if (!requestCategoryId || !responderCategoryId) return true;
  if (requestCategoryId === responderCategoryId) return true;
  const requestIsSpeciality = !!parentOf[requestCategoryId];
  const responderIsSpeciality = !!parentOf[responderCategoryId];
  if (requestIsSpeciality && responderIsSpeciality) return false;
  return categoryRoot(requestCategoryId, parentOf) === categoryRoot(responderCategoryId, parentOf);
}
