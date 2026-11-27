import { Capacitor } from "@capacitor/core";
import type { Category } from "@/types";
import { getBusinessTheme, PACKAGE_KEYS } from "@/lib/businessPackages";

// The Personal-account Android release has a non-medical marketplace.
// Revisit this platform scope in a new Play release after account conversion.
export const RESTRICTED_ANDROID_MARKETPLACE = Capacitor.getPlatform() === "android";
export const MARKETPLACE_UNAVAILABLE = "This listing isn't available in this version of STRYT.";

const EXCLUDED_TERMS = /\b(?:health|healthcare|medical|medicines?|(?:poly)?clinics?|hospitals?|doctors?|physicians?|surgeons?|dispensar(?:y|ies)|dent(?:al|ist(?:ry)?s?)|physio(?:therapy|therapists?)|pharmac(?:y|ies|ists?|euticals?)|chemists?|diagnostics?|pathology|radiology|(?:blood|lab) tests?|tele(?:health|medicine)|ayurved\w*|homeopath\w*|vets?|veterinar\w*|fitness|wellness|gyms?|yoga|nutritionists?|dietitians?|opticians?)\b/i;
const EXCLUDED_PACKAGES = new Set(["clinic", "diagnostics", "pharmacy", "vet", "fitness"]);

export const MARKETPLACE_PACKAGE_KEYS = RESTRICTED_ANDROID_MARKETPLACE
  ? PACKAGE_KEYS.filter((key) => !EXCLUDED_PACKAGES.has(key))
  : PACKAGE_KEYS;

export interface MarketplaceEntry {
  id?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  subCategory?: string | null;
  name?: string | null;
  displayName?: string | null;
  slug?: string | null;
  packageKey?: string | null;
  operatingModel?: string | null;
}

export function isExcludedMarketplaceEntry(entry: MarketplaceEntry): boolean {
  if (entry.operatingModel === "HEALTHCARE_CONSULT" || EXCLUDED_PACKAGES.has(entry.packageKey ?? "")) return true;
  if (EXCLUDED_PACKAGES.has(getBusinessTheme(entry.categoryName ?? entry.name, entry.subCategory))) return true;
  return [entry.id, entry.categoryId, entry.categoryName, entry.subCategory, entry.name, entry.displayName, entry.slug]
    .some((value) => value != null && EXCLUDED_TERMS.test(value.replace(/[_-]+/g, " ")));
}

/** Remove the whole subtree, including leaves whose labels aren't medical by themselves. */
export function filterMarketplaceCategories(categories: Category[]): Category[] {
  if (!RESTRICTED_ANDROID_MARKETPLACE) return categories;
  const blocked = new Set(categories.filter(isExcludedMarketplaceEntry).map((category) => category.id));
  let changed: boolean;
  do {
    changed = false;
    for (const category of categories) {
      if (category.parentId && blocked.has(category.parentId) && !blocked.has(category.id)) {
        blocked.add(category.id);
        changed = true;
      }
    }
  } while (changed);
  return categories.filter((category) => !blocked.has(category.id));
}
