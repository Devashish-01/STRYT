import { businessService, providerService } from "@/services";
import type { CommunityPost } from "@/types";

export interface ResolvedRecommendation {
  name: string;
  image: string;
  sub: string;
}

/** Resolves each recommendation's real business/provider display info by id.
 *  A recommended listing isn't guaranteed to be inside the viewer's own
 *  "nearby" discovery list (it can be recommended by someone else, for a
 *  place outside the current viewer's radius), so this looks each one up
 *  directly instead of searching a pre-fetched geo-scoped array — which
 *  silently fell back to a raw listing id whenever the listing wasn't in
 *  that array. */
export async function resolveRecommendations(
  recs: NonNullable<CommunityPost["recommendations"]>
): Promise<Record<string, ResolvedRecommendation>> {
  const targets = Array.from(
    new Map(recs.map((r) => [`${r.listingType}:${r.listingId}`, r])).values()
  ).filter((r) => r.listingType === "BUSINESS" || r.listingType === "PROVIDER");

  const entries = await Promise.all(
    targets.map(async (r): Promise<[string, ResolvedRecommendation]> => {
      try {
        if (r.listingType === "BUSINESS") {
          const b = await businessService.get(r.listingId);
          if (!b) return [r.listingId, { name: "Listing", image: "", sub: "" }];
          return [r.listingId, { name: b.name, image: b.coverImage, sub: b.subCategory ?? "" }];
        }
        const p = await providerService.get(r.listingId);
        if (!p) return [r.listingId, { name: "Listing", image: "", sub: "" }];
        return [r.listingId, { name: p.displayName, image: p.avatar, sub: p.categoryName ?? "" }];
      } catch {
        return [r.listingId, { name: "Listing", image: "", sub: "" }];
      }
    })
  );
  return Object.fromEntries(entries);
}
