/**
 * Business Packages — one config-driven system covering every category.
 *
 * Started as a two-vertical pilot (medical/restaurant) hardcoded straight
 * into the screens that used it. That didn't scale: adding a third vertical
 * meant editing `BusinessOnboard.tsx` and `BusinessDetail.tsx` directly. This
 * replaces it with a closed catalogue of packages — one config object each,
 * covering every seeded category — so adding or changing a vertical is a
 * data edit here, never a screen edit. See docs/trackers plan
 * "Business Packages — one system for every category" for the full design.
 *
 * Resolution order (see `resolvePackage`):
 *   1. An explicit `packageKey` stored on the business/provider (the owner's
 *      own confirmed/overridden choice) — always wins.
 *   2. Keyword derivation from `categoryName`/`subCategory` — the pilot's
 *      original mechanism, kept as the fallback for rows with no stored
 *      choice yet (pre-migration data) and for user-proposed categories
 *      (`catalogService.proposeCategory`) that have no package assigned.
 *   3. `"generic"` — every field on it is the literal already hardcoded in
 *      the app before this system existed, which is what keeps every
 *      unmapped category byte-for-byte unchanged.
 *
 * Every string a screen shows for a themed business MUST come from the
 * matching `BusinessPackage` object — no consumer should branch on a
 * package key itself. That rule is what makes the next package free.
 */

export type BusinessPackageKey =
  | "clinic"
  | "diagnostics"
  | "vet"
  | "pharmacy"
  | "dining"
  | "takeaway"
  | "salon"
  | "shop"
  | "homeservice"
  | "learning"
  | "fitness"
  | "professional"
  | "events"
  | "generic";

export const PACKAGE_KEYS: BusinessPackageKey[] = [
  "clinic", "diagnostics", "vet", "pharmacy", "dining", "takeaway", "salon",
  "shop", "homeservice", "learning", "fitness", "professional", "events",
  "generic",
];

/** One of a small closed set of accent families, each mapped to CSS custom
 *  properties in index.css ([data-biz-theme="..."] rules). "purple" needs no
 *  override — it's the :root default (brand purple) every var already falls
 *  back to, so packages that don't want a distinct accent just use it. */
export type AccentTone = "blue" | "teal" | "green" | "amber" | "orange" | "red" | "pink" | "purple";

export interface BusinessPackage {
  key: BusinessPackageKey;
  /** Shown in the picker/confirm card and Settings, e.g. "Clinic". */
  label: string;
  icon: string;
  /** One line for the onboarding confirm card: what this package turns on. */
  blurb: string;
  /** Pill tone for the category badge chip — irrelevant for "generic" (no badge is shown). */
  badgeTone: string;
  accentTone: AccentTone;
  /** What this business calls its catalogue — tab label AND owner AppBar title. */
  catalogNoun: string;
  catalogEmptyText: string;
  catalogRenderMode: "list" | "grid";
  /** ADD / qty-stepper on catalog items — a consultation isn't something you buy 3 of. */
  showCartStepper: boolean;
  catalogItemCta: { show: boolean; label: string };
  /** Whether bookings are ON by default for a newly-onboarded business of this package — owner can override in Settings. */
  bookingsDefault: boolean;
  primaryCtaLabel: string;
  bookingClosedLabel: string;
  /** About-tab "Hours" section heading. */
  hoursLabel: string;
  slotCapacityLabel: string;
  showSlotCapacitySection: boolean;
  itemNounSingular: string;
  itemNamePlaceholder: string;
  foodToggleMode: "auto-nonfood" | "auto-food" | "manual";
  /** Onboarding hint shown under the sub-category chips, only when this package was suggested. */
  onboardSubcategoryHint?: string;
  /** Onboarding hint replacing the generic "great cover photo" line. */
  onboardPhotoHint?: string;
  /** The words the booking flow (AppointmentSheet, PaymentSheet, the owner's
   *  booking console) uses in place of "appointment" for this package. */
  vocabulary: BizVocabulary;
}

export interface BizVocabulary {
  /** Lowercase singular, used inline: "your {noun}", "cancel this {noun}". */
  noun: string;
  /** Capitalized singular, sentence/title-start: "Consultation". */
  nounCap: string;
  /** Lowercase plural: "consultations". */
  nounPlural: string;
  /** AppointmentSheet header when booking new (no emoji — the caller adds one). */
  sheetTitleNew: string;
  /** AppointmentSheet header when rescheduling (no emoji — the caller adds one). */
  sheetTitleReschedule: string;
  /** Verb-phrase for the post-booking toast, prepended to " for {date} at {time} 📅". */
  bookedVerb: string;
}

/**
 * Keyword derivation, one bucket per package. Order matters: earlier buckets
 * are checked first, so a category name that could plausibly match two
 * buckets resolves to the more specific one listed first.
 */
const KEYWORDS: { key: BusinessPackageKey; words: string[] }[] = [
  { key: "diagnostics", words: ["diagnostic", "pathology lab", "blood test"] },
  { key: "vet", words: ["veterinar", "vet clinic", " vet "] },
  {
    key: "clinic",
    words: [
      "general physician", "physician", "doctor", "dentist", "dental",
      "clinic", "health & medical",
    ],
  },
  { key: "pharmacy", words: ["pharmacy", "chemist", "medical store"] },
  {
    key: "dining",
    words: ["restaurant", "cafe", "café", "bakery", "food & beverage", "dine"],
  },
  {
    key: "takeaway",
    words: [
      "tiffin", "home kitchen", "sweet shop", "juice", "ice cream", "kitchen",
      "dhaba", "canteen",
    ],
  },
  {
    key: "salon",
    words: [
      "barber", "salon", "spa", "massage", "nail", "makeup", "pet grooming",
      "beauty & personal care",
    ],
  },
  {
    key: "shop",
    words: [
      "grocery", "kirana", "clothing", "footwear", "electronics", "mobile",
      "book", "stationery", "pet shop", "retail shops",
    ],
  },
  {
    key: "homeservice",
    words: [
      "plumber", "electrician", "carpenter", "ac repair", "cleaning service",
      "pest control", "home & repair",
    ],
  },
  {
    key: "learning",
    words: ["tuition", "coaching", "music", "dance", "tutor", "education & tutoring"],
  },
  { key: "fitness", words: ["gym", "yoga", "trainer", "fitness & wellness"] },
  { key: "professional", words: ["lawyer", "ca / tax", "ca/tax", "tax", "designer", "developer", "professional services"] },
  {
    key: "events",
    words: [
      "event planner", "decorator", "mehndi", "photographer", "caterer",
      "catering", "home cook", "chef", "events & personal",
    ],
  },
];

export function getBusinessTheme(
  categoryName?: string | null,
  subCategory?: string | null
): BusinessPackageKey {
  const haystacks = [subCategory, categoryName]
    .map((s) => (s ?? "").toLowerCase().trim())
    .filter(Boolean);

  for (const hay of haystacks) {
    for (const bucket of KEYWORDS) {
      if (bucket.words.some((w) => hay.includes(w))) return bucket.key;
    }
  }
  return "generic";
}

/**
 * The single resolution path every consumer should use. An explicit
 * `packageKey` (the owner's own confirmed/overridden choice, once Phase 1's
 * migration lands) always wins over derivation; entities that don't have one
 * yet fall back to the same keyword matching the pilot always used.
 */
export function resolvePackage(entity: {
  packageKey?: string | null;
  categoryName?: string | null;
  subCategory?: string | null;
}): BusinessPackageKey {
  if (entity.packageKey && (PACKAGE_KEYS as string[]).includes(entity.packageKey)) {
    return entity.packageKey as BusinessPackageKey;
  }
  return getBusinessTheme(entity.categoryName, entity.subCategory);
}

export const BUSINESS_PACKAGES: Record<BusinessPackageKey, BusinessPackage> = {
  clinic: {
    key: "clinic",
    label: "Clinic",
    icon: "🩺",
    blurb: "Consultation booking, no cart — patients book a slot, not add items to a bag.",
    badgeTone: "blue",
    accentTone: "blue",
    catalogNoun: "Services",
    catalogEmptyText: "This clinic hasn't listed its services yet.",
    catalogRenderMode: "list",
    showCartStepper: false,
    catalogItemCta: { show: true, label: "📅 Book Consultation" },
    bookingsDefault: true,
    primaryCtaLabel: "Book Consultation",
    bookingClosedLabel: "Not taking bookings right now",
    hoursLabel: "Consultation Hours",
    slotCapacityLabel: "Patients at the same time",
    showSlotCapacitySection: true,
    itemNounSingular: "service",
    itemNamePlaceholder: "e.g. General Consultation, Root Canal, Follow-up Visit",
    foodToggleMode: "auto-nonfood",
    onboardSubcategoryHint: "Pick every specialty this location offers — patients search by these.",
    onboardPhotoHint: "Show your reception or clinic front — it builds trust before the first visit.",
    vocabulary: {
      noun: "consultation", nounCap: "Consultation", nounPlural: "consultations",
      sheetTitleNew: "Book a Consultation", sheetTitleReschedule: "Reschedule Consultation",
      bookedVerb: "Consultation booked",
    },
  },
  diagnostics: {
    key: "diagnostics",
    label: "Diagnostics",
    icon: "🔬",
    blurb: "Test booking, no cart — patients book a test slot, not add items to a bag.",
    badgeTone: "purple",
    accentTone: "teal",
    catalogNoun: "Tests",
    catalogEmptyText: "This lab hasn't listed its tests yet.",
    catalogRenderMode: "list",
    showCartStepper: false,
    catalogItemCta: { show: true, label: "📅 Book a Test" },
    bookingsDefault: true,
    primaryCtaLabel: "Book a Test",
    bookingClosedLabel: "Not taking bookings right now",
    hoursLabel: "Collection Hours",
    slotCapacityLabel: "Patients at the same time",
    showSlotCapacitySection: true,
    itemNounSingular: "test",
    itemNamePlaceholder: "e.g. Complete Blood Count, Lipid Profile, X-Ray",
    foodToggleMode: "auto-nonfood",
    onboardSubcategoryHint: "Pick every test category this lab offers.",
    onboardPhotoHint: "Show your reception or sample-collection area — it builds trust before the first visit.",
    vocabulary: {
      noun: "test", nounCap: "Test", nounPlural: "tests",
      sheetTitleNew: "Book a Test", sheetTitleReschedule: "Reschedule Test",
      bookedVerb: "Test booked",
    },
  },
  vet: {
    key: "vet",
    label: "Veterinary",
    icon: "🐾",
    blurb: "Consultation booking, no cart — pet owners book a visit slot.",
    badgeTone: "green",
    accentTone: "green",
    catalogNoun: "Services",
    catalogEmptyText: "This clinic hasn't listed its services yet.",
    catalogRenderMode: "list",
    showCartStepper: false,
    catalogItemCta: { show: true, label: "📅 Book a Visit" },
    bookingsDefault: true,
    primaryCtaLabel: "Book a Visit",
    bookingClosedLabel: "Not taking bookings right now",
    hoursLabel: "Clinic Hours",
    slotCapacityLabel: "Pets at the same time",
    showSlotCapacitySection: true,
    itemNounSingular: "service",
    itemNamePlaceholder: "e.g. Vaccination, Grooming, General Checkup",
    foodToggleMode: "auto-nonfood",
    onboardSubcategoryHint: "Pick every service this location offers.",
    onboardPhotoHint: "Show your clinic front or a happy patient — it builds trust before the first visit.",
    vocabulary: {
      noun: "visit", nounCap: "Visit", nounPlural: "visits",
      sheetTitleNew: "Book a Visit", sheetTitleReschedule: "Reschedule Visit",
      bookedVerb: "Visit booked",
    },
  },
  pharmacy: {
    key: "pharmacy",
    label: "Pharmacy",
    icon: "💊",
    blurb: "Cart and checkout, no bookings by default — customers buy off the shelf.",
    badgeTone: "green",
    accentTone: "amber",
    catalogNoun: "Medicines",
    catalogEmptyText: "This pharmacy hasn't listed its medicines yet.",
    catalogRenderMode: "list",
    showCartStepper: true,
    catalogItemCta: { show: false, label: "" },
    bookingsDefault: false,
    primaryCtaLabel: "Book appointment",
    bookingClosedLabel: "Not accepting appointments right now",
    hoursLabel: "Store Hours",
    slotCapacityLabel: "Bookings at the same time",
    showSlotCapacitySection: false,
    itemNounSingular: "item",
    itemNamePlaceholder: "e.g. Paracetamol 500mg, First Aid Kit, Thermometer",
    foodToggleMode: "manual",
    onboardPhotoHint: "Show your storefront or counter — it builds trust before the first visit.",
    vocabulary: {
      noun: "order", nounCap: "Order", nounPlural: "orders",
      sheetTitleNew: "Place Your Order", sheetTitleReschedule: "Change Order",
      bookedVerb: "Order placed",
    },
  },
  dining: {
    key: "dining",
    label: "Dining",
    icon: "🍽️",
    blurb: "Photo menu with cart, table reservations instead of appointments.",
    badgeTone: "orange",
    accentTone: "orange",
    catalogNoun: "Menu",
    catalogEmptyText: "This kitchen hasn't published its menu yet.",
    catalogRenderMode: "grid",
    showCartStepper: true,
    catalogItemCta: { show: false, label: "" },
    bookingsDefault: true,
    primaryCtaLabel: "Reserve a Table",
    bookingClosedLabel: "Not accepting reservations right now",
    hoursLabel: "Opening Hours",
    slotCapacityLabel: "Tables at the same time",
    showSlotCapacitySection: true,
    itemNounSingular: "dish",
    itemNamePlaceholder: "e.g. Butter Chicken, Margherita Pizza, Cold Coffee",
    foodToggleMode: "auto-food",
    onboardSubcategoryHint: "Pick every cuisine/format this location serves.",
    onboardPhotoHint: "Show your dining area or best dish — food photos get 3x more views.",
    vocabulary: {
      noun: "reservation", nounCap: "Reservation", nounPlural: "reservations",
      sheetTitleNew: "Reserve a Table", sheetTitleReschedule: "Change Reservation",
      bookedVerb: "Table reserved",
    },
  },
  takeaway: {
    key: "takeaway",
    label: "Takeaway",
    icon: "🥡",
    blurb: "Photo menu with cart, no bookings by default — customers order for pickup/delivery.",
    badgeTone: "orange",
    accentTone: "red",
    catalogNoun: "Menu",
    catalogEmptyText: "This kitchen hasn't published its menu yet.",
    catalogRenderMode: "grid",
    showCartStepper: true,
    catalogItemCta: { show: false, label: "" },
    bookingsDefault: false,
    primaryCtaLabel: "Order Now",
    bookingClosedLabel: "Not accepting orders right now",
    hoursLabel: "Opening Hours",
    slotCapacityLabel: "Orders at the same time",
    showSlotCapacitySection: false,
    itemNounSingular: "dish",
    itemNamePlaceholder: "e.g. Dal Makhani, Gulab Jamun, Fresh Lime Soda",
    foodToggleMode: "auto-food",
    onboardSubcategoryHint: "Pick every cuisine/format you offer.",
    onboardPhotoHint: "Show your best dishes — food photos get 3x more views.",
    vocabulary: {
      noun: "order", nounCap: "Order", nounPlural: "orders",
      sheetTitleNew: "Place Your Order", sheetTitleReschedule: "Change Order",
      bookedVerb: "Order placed",
    },
  },
  salon: {
    key: "salon",
    label: "Salon",
    icon: "💇",
    blurb: "Appointment booking, no cart — clients book a chair, not add items to a bag.",
    badgeTone: "pink",
    accentTone: "pink",
    catalogNoun: "Services",
    catalogEmptyText: "This business hasn't listed its services yet.",
    catalogRenderMode: "list",
    showCartStepper: false,
    catalogItemCta: { show: true, label: "📅 Book Appointment" },
    bookingsDefault: true,
    primaryCtaLabel: "Book Appointment",
    bookingClosedLabel: "Not taking bookings right now",
    hoursLabel: "Hours",
    slotCapacityLabel: "Chairs at the same time",
    showSlotCapacitySection: true,
    itemNounSingular: "service",
    itemNamePlaceholder: "e.g. Haircut & Style, Manicure, Full Body Massage",
    foodToggleMode: "manual",
    onboardSubcategoryHint: "Pick every service this location offers.",
    onboardPhotoHint: "Show your salon interior — customers browsing want to see the space.",
    vocabulary: {
      noun: "appointment", nounCap: "Appointment", nounPlural: "appointments",
      sheetTitleNew: "Book Appointment", sheetTitleReschedule: "Reschedule Appointment",
      bookedVerb: "Appointment booked",
    },
  },
  shop: {
    key: "shop",
    label: "Shop",
    icon: "🛍️",
    blurb: "Cart and checkout, no bookings by default — a straightforward retail page.",
    badgeTone: "gray",
    accentTone: "purple",
    catalogNoun: "Products",
    catalogEmptyText: "This shop hasn't listed any products yet.",
    catalogRenderMode: "grid",
    showCartStepper: true,
    catalogItemCta: { show: false, label: "" },
    bookingsDefault: false,
    primaryCtaLabel: "Book appointment",
    bookingClosedLabel: "Not accepting appointments right now",
    hoursLabel: "Store Hours",
    slotCapacityLabel: "Bookings at the same time",
    showSlotCapacitySection: false,
    itemNounSingular: "item",
    itemNamePlaceholder: "e.g. Cotton T-Shirt, Phone Case, Notebook Set",
    foodToggleMode: "manual",
    onboardPhotoHint: "Show your storefront or best-selling products.",
    vocabulary: {
      noun: "order", nounCap: "Order", nounPlural: "orders",
      sheetTitleNew: "Place Your Order", sheetTitleReschedule: "Change Order",
      bookedVerb: "Order placed",
    },
  },
  homeservice: {
    key: "homeservice",
    label: "Home Service",
    icon: "🔧",
    blurb: "Visit requests, no cart — customers request a technician at their address.",
    badgeTone: "amber",
    accentTone: "amber",
    catalogNoun: "Services",
    catalogEmptyText: "This business hasn't listed its services yet.",
    catalogRenderMode: "list",
    showCartStepper: false,
    catalogItemCta: { show: true, label: "🔧 Request a Visit" },
    bookingsDefault: true,
    primaryCtaLabel: "Request a Visit",
    bookingClosedLabel: "Not taking new requests right now",
    hoursLabel: "Working Hours",
    slotCapacityLabel: "Jobs at the same time",
    showSlotCapacitySection: true,
    itemNounSingular: "service",
    itemNamePlaceholder: "e.g. Tap Repair, Wiring Inspection, Full House Cleaning",
    foodToggleMode: "manual",
    onboardSubcategoryHint: "Pick every service you offer.",
    onboardPhotoHint: "Show recent work — before/after photos build trust fast.",
    vocabulary: {
      noun: "visit", nounCap: "Visit", nounPlural: "visits",
      sheetTitleNew: "Request a Visit", sheetTitleReschedule: "Reschedule Visit",
      bookedVerb: "Visit requested",
    },
  },
  learning: {
    key: "learning",
    label: "Learning",
    icon: "📖",
    blurb: "Class booking, no cart — students book a seat in a batch or a session.",
    badgeTone: "purple",
    accentTone: "purple",
    catalogNoun: "Courses",
    catalogEmptyText: "This business hasn't listed its courses yet.",
    catalogRenderMode: "list",
    showCartStepper: false,
    catalogItemCta: { show: true, label: "📅 Book a Class" },
    bookingsDefault: true,
    primaryCtaLabel: "Book a Class",
    bookingClosedLabel: "Not taking new students right now",
    hoursLabel: "Class Hours",
    slotCapacityLabel: "Students per batch",
    showSlotCapacitySection: true,
    itemNounSingular: "course",
    itemNamePlaceholder: "e.g. Beginner Guitar, Spoken English, Class 10 Maths",
    foodToggleMode: "manual",
    onboardSubcategoryHint: "Pick every subject/skill this location teaches.",
    onboardPhotoHint: "Show your classroom or a class in session.",
    vocabulary: {
      noun: "class", nounCap: "Class", nounPlural: "classes",
      sheetTitleNew: "Book a Class", sheetTitleReschedule: "Reschedule Class",
      bookedVerb: "Class booked",
    },
  },
  fitness: {
    key: "fitness",
    label: "Fitness",
    icon: "💪",
    blurb: "Session booking, no cart — members book a class or a slot.",
    badgeTone: "green",
    accentTone: "green",
    catalogNoun: "Programs",
    catalogEmptyText: "This business hasn't listed its programs yet.",
    catalogRenderMode: "list",
    showCartStepper: false,
    catalogItemCta: { show: true, label: "📅 Book a Session" },
    bookingsDefault: true,
    primaryCtaLabel: "Book a Session",
    bookingClosedLabel: "Not taking new bookings right now",
    hoursLabel: "Hours",
    slotCapacityLabel: "Members per session",
    showSlotCapacitySection: true,
    itemNounSingular: "program",
    itemNamePlaceholder: "e.g. Monthly Membership, Personal Training, Zumba Class",
    foodToggleMode: "manual",
    onboardSubcategoryHint: "Pick every program this location offers.",
    onboardPhotoHint: "Show your facility or a class in session.",
    vocabulary: {
      noun: "session", nounCap: "Session", nounPlural: "sessions",
      sheetTitleNew: "Book a Session", sheetTitleReschedule: "Reschedule Session",
      bookedVerb: "Session booked",
    },
  },
  professional: {
    key: "professional",
    label: "Professional",
    icon: "💼",
    blurb: "Consultation requests, no cart — clients request a meeting, not a product.",
    badgeTone: "gray",
    accentTone: "purple",
    catalogNoun: "Services",
    catalogEmptyText: "This business hasn't listed its services yet.",
    catalogRenderMode: "list",
    showCartStepper: false,
    catalogItemCta: { show: true, label: "📅 Request a Consultation" },
    bookingsDefault: true,
    primaryCtaLabel: "Request a Consultation",
    bookingClosedLabel: "Not taking new clients right now",
    hoursLabel: "Office Hours",
    slotCapacityLabel: "Clients at the same time",
    showSlotCapacitySection: true,
    itemNounSingular: "service",
    itemNamePlaceholder: "e.g. Property Registration, GST Filing, Logo Design",
    foodToggleMode: "manual",
    onboardSubcategoryHint: "Pick every service you offer.",
    onboardPhotoHint: "Show your office or past work.",
    vocabulary: {
      noun: "consultation", nounCap: "Consultation", nounPlural: "consultations",
      sheetTitleNew: "Request a Consultation", sheetTitleReschedule: "Reschedule Consultation",
      bookedVerb: "Consultation requested",
    },
  },
  events: {
    key: "events",
    label: "Events",
    icon: "🎉",
    blurb: "Availability checks, no cart — clients check a date before booking.",
    badgeTone: "pink",
    accentTone: "pink",
    catalogNoun: "Packages",
    catalogEmptyText: "This business hasn't listed its packages yet.",
    catalogRenderMode: "grid",
    showCartStepper: false,
    catalogItemCta: { show: true, label: "📅 Check Availability" },
    bookingsDefault: true,
    primaryCtaLabel: "Check Availability",
    bookingClosedLabel: "Not taking new bookings right now",
    hoursLabel: "Hours",
    slotCapacityLabel: "Events at the same time",
    showSlotCapacitySection: true,
    itemNounSingular: "package",
    itemNamePlaceholder: "e.g. Birthday Decor Package, Wedding Catering, Bridal Mehndi",
    foodToggleMode: "manual",
    onboardSubcategoryHint: "Pick every kind of event you cover.",
    onboardPhotoHint: "Show your best work — real event photos sell packages.",
    vocabulary: {
      noun: "booking", nounCap: "Booking", nounPlural: "bookings",
      sheetTitleNew: "Request a Booking", sheetTitleReschedule: "Change Booking",
      bookedVerb: "Booking requested",
    },
  },
  generic: {
    key: "generic",
    label: "Generic",
    icon: "",
    blurb: "The default page — every field here matches what every business already had.",
    badgeTone: "blue",
    accentTone: "purple",
    catalogNoun: "Catalogue",
    catalogEmptyText: "Nothing listed here yet.",
    catalogRenderMode: "list",
    showCartStepper: true,
    catalogItemCta: { show: true, label: "📅 Book appointment" },
    bookingsDefault: true,
    primaryCtaLabel: "Book appointment",
    bookingClosedLabel: "Not accepting appointments right now",
    hoursLabel: "Hours",
    slotCapacityLabel: "Bookings at the same time",
    showSlotCapacitySection: true,
    itemNounSingular: "listing",
    itemNamePlaceholder: "e.g. Classic Haircut, Phone Case, Sofa Repair",
    foodToggleMode: "manual",
    vocabulary: {
      noun: "appointment", nounCap: "Appointment", nounPlural: "appointments",
      sheetTitleNew: "Schedule Appointment", sheetTitleReschedule: "Reschedule Appointment",
      bookedVerb: "Appointment scheduled",
    },
  },
};
