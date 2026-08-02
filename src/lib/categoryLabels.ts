/**
 * What a business calls its list of things (feedback #10).
 *
 * The profile tab was hardcoded to "Menu" for everyone, so a salon, a gym and
 * a chemist all advertised a Menu. This maps a business's category onto the
 * word its owner and customers would actually use.
 *
 * Scoped deliberately to LABELS — same layout for every category, only the
 * wording changes. Per-category layouts are a much larger piece of work and
 * would not have made the profile read any more correctly.
 *
 * Matched on `categoryName` because that's what the `Business` type carries —
 * there's no slug on it. Keyword matching rather than an exact-name table so a
 * renamed or newly-added category still lands somewhere sensible instead of
 * silently falling back. Anything unmatched gets the neutral "Catalogue".
 */

export type CatalogLabel = "Menu" | "Services" | "Products" | "Catalogue";

/** Order matters: the first group whose keywords match wins. */
const GROUPS: { label: CatalogLabel; keywords: string[] }[] = [
  {
    // Things you eat or drink, made to order.
    label: "Menu",
    keywords: [
      "restaurant", "cafe", "café", "bakery", "food", "beverage", "ice cream",
      "juice", "sweet", "tiffin", "kitchen", "dhaba", "canteen", "catering",
    ],
  },
  {
    // Things done TO you, usually by appointment.
    label: "Services",
    keywords: [
      "salon", "barber", "spa", "massage", "nail", "gym", "fitness", "yoga",
      "dentist", "physician", "doctor", "clinic", "lab", "diagnostic", "vet",
      "veterinar", "health", "medical", "repair", "service", "tailor", "laundry",
    ],
  },
  {
    // Things you take away off a shelf.
    label: "Products",
    keywords: [
      "grocery", "kirana", "pharmacy", "chemist", "clothing", "footwear",
      "electronics", "mobile", "book", "stationery", "pet", "retail", "shop",
      "store", "hardware", "furniture",
    ],
  },
];

/**
 * The noun for this business's catalogue. Falls back to "Catalogue" — neutral
 * and always true — rather than guessing.
 */
export function catalogLabel(categoryName?: string | null, subCategory?: string | null): CatalogLabel {
  // Both are checked: "Retail Shops" as a category with "Bakery" as the
  // sub-category should read Menu, and the more specific field wins.
  const haystacks = [subCategory, categoryName]
    .map((s) => (s ?? "").toLowerCase().trim())
    .filter(Boolean);

  for (const hay of haystacks) {
    for (const group of GROUPS) {
      if (group.keywords.some((k) => hay.includes(k))) return group.label;
    }
  }
  return "Catalogue";
}

/** Empty-state copy that matches the label, so the two never disagree. */
export function catalogEmptyText(label: CatalogLabel): string {
  switch (label) {
    case "Menu":      return "This kitchen hasn't published its menu yet.";
    case "Services":  return "This business hasn't listed its services yet.";
    case "Products":  return "This shop hasn't listed any products yet.";
    default:          return "Nothing listed here yet.";
  }
}
