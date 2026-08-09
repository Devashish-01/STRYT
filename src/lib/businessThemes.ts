/**
 * Category-tailored storefronts (Doctor + Restaurant pilot).
 *
 * Every business today renders through one identical layout — same
 * "Book appointment" CTA, same ADD/qty-stepper cart, same owner-side catalog
 * form, whether it's a clinic or a hardware shop. This maps a business's
 * category onto a small theme that tailors CTA copy, which catalog controls
 * show, and a scoped accent color — for exactly two verticals so far.
 *
 * Deliberately its own file, not an extension of `categoryLabels.ts`: that
 * file's "Services" bucket also covers salon/gym/repair/tailor, which must
 * stay generic here. Same technique though — keyword matching on
 * `categoryName`/`subCategory` (there's no slug on `Business`/`Provider`,
 * and a stored `categoryName` can be either the parent group name from
 * onboarding's top-level chip or a leaf name from seed/legacy data, so both
 * are checked, sub-category first). Anything unmatched gets "generic",
 * whose every field below is the literal already hardcoded in the app
 * today — that's what keeps every other category byte-for-byte unchanged.
 */

export type BusinessThemeKey = "medical" | "restaurant" | "generic";

export interface BusinessThemeConfig {
  icon: string;
  /** Pill tone for the category badge chip — unused for "generic". */
  badgeTone: "blue" | "orange";
  primaryCtaLabel: string;
  bookingClosedLabel: string;
  catalogItemCta: { show: boolean; label: string };
  /** ADD / qty-stepper on catalog items — a consultation isn't something you buy 3 of. */
  showCartStepper: boolean;
  catalogRenderMode: "list" | "grid";
  /** About-tab "Hours" section heading. */
  hoursLabel: string;
  itemNounSingular: string;
  itemNamePlaceholder: string;
  /** Owner-side Catalog manager AppBar title. */
  catalogManagerTitle: string;
  foodToggleMode: "auto-nonfood" | "auto-food" | "manual";
  showSlotCapacitySection: boolean;
  slotCapacityLabel: string;
}

/** Order matters: medical checked before restaurant; first match wins. */
const MEDICAL_KEYWORDS = [
  "health & medical", "general physician", "physician", "doctor", "dentist",
  "dental", "diagnostic", "clinic", "veterinar", "vet",
  // Chemist/Pharmacy is deliberately NOT here — it's a retail counter, not a
  // consultation, matching categoryLabels.ts's own existing Products call.
];

const RESTAURANT_KEYWORDS = [
  "restaurant", "food & beverage", "food", "beverage", "cafe", "café",
  "bakery", "tiffin", "sweet shop", "juice", "ice cream", "kitchen",
  "dhaba", "canteen",
];

export function getBusinessTheme(
  categoryName?: string | null,
  subCategory?: string | null
): BusinessThemeKey {
  const haystacks = [subCategory, categoryName]
    .map((s) => (s ?? "").toLowerCase().trim())
    .filter(Boolean);

  for (const hay of haystacks) {
    if (MEDICAL_KEYWORDS.some((k) => hay.includes(k))) return "medical";
    if (RESTAURANT_KEYWORDS.some((k) => hay.includes(k))) return "restaurant";
  }
  return "generic";
}

export const BUSINESS_THEMES: Record<BusinessThemeKey, BusinessThemeConfig> = {
  medical: {
    icon: "🩺",
    badgeTone: "blue",
    primaryCtaLabel: "Book Consultation",
    bookingClosedLabel: "Not taking bookings right now",
    catalogItemCta: { show: true, label: "📅 Book Consultation" },
    showCartStepper: false,
    catalogRenderMode: "list",
    hoursLabel: "Consultation Hours",
    itemNounSingular: "service",
    itemNamePlaceholder: "e.g. General Consultation, Root Canal, Blood Test",
    catalogManagerTitle: "Services",
    foodToggleMode: "auto-nonfood",
    showSlotCapacitySection: true,
    slotCapacityLabel: "Patients at the same time",
  },
  restaurant: {
    icon: "🍽️",
    badgeTone: "orange",
    primaryCtaLabel: "Reserve a Table",
    bookingClosedLabel: "Not accepting reservations right now",
    catalogItemCta: { show: false, label: "" },
    showCartStepper: true,
    catalogRenderMode: "grid",
    hoursLabel: "Opening Hours",
    itemNounSingular: "dish",
    itemNamePlaceholder: "e.g. Butter Chicken, Margherita Pizza, Cold Coffee",
    catalogManagerTitle: "Menu",
    foodToggleMode: "auto-food",
    showSlotCapacitySection: false,
    slotCapacityLabel: "Bookings at the same time",
  },
  generic: {
    icon: "",
    badgeTone: "blue",
    primaryCtaLabel: "Book appointment",
    bookingClosedLabel: "Not accepting appointments right now",
    catalogItemCta: { show: true, label: "📅 Book appointment" },
    showCartStepper: true,
    catalogRenderMode: "list",
    hoursLabel: "Hours",
    itemNounSingular: "listing",
    itemNamePlaceholder: "e.g. Classic Haircut, Phone Case, Sofa Repair",
    catalogManagerTitle: "Catalog",
    foodToggleMode: "manual",
    showSlotCapacitySection: true,
    slotCapacityLabel: "Bookings at the same time",
  },
};
