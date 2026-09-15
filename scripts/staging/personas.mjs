// Synthetic staging personas. Deterministic ids, obviously fake names, numbers in the +91 90000 0000x
// test range (test OTP numbers never trigger an SMS). Used by setup-staging-auth.mjs, seed-staging.mjs
// and the E2E fixtures. STAGING ONLY.

export const STAGING_AREA = { area: "Test Nagar", city: "Pune", lat: 18.5362, lng: 73.8939 };

export const PERSONAS = [
  { key: "customer1", id: "00000000-0000-4000-8000-000000000001", phone: "+919000000001", name: "Test Customer One", alias: "test_customer_one", roles: ["customer"] },
  { key: "customer2", id: "00000000-0000-4000-8000-000000000002", phone: "+919000000002", name: "Test Customer Two", alias: "test_customer_two", roles: ["customer"] },
  { key: "owner1", id: "00000000-0000-4000-8000-000000000003", phone: "+919000000003", name: "Test Owner One", alias: "test_owner_one", roles: ["customer", "business"] },
  { key: "staff_queue", id: "00000000-0000-4000-8000-000000000004", phone: "+919000000004", name: "Test Staff Queue", alias: "test_staff_queue", roles: ["customer"] },
  { key: "staff_appointments", id: "00000000-0000-4000-8000-000000000005", phone: "+919000000005", name: "Test Staff Appointments", alias: "test_staff_appts", roles: ["customer"] },
  { key: "provider1", id: "00000000-0000-4000-8000-000000000006", phone: "+919000000006", name: "Test Provider One", alias: "test_provider_one", roles: ["customer", "provider"] },
  { key: "admin1", id: "00000000-0000-4000-8000-000000000007", phone: "+919000000007", name: "Test Admin One", alias: "test_admin_one", roles: ["customer", "admin"] },
];

export const BUSINESS = { id: "b_00000000000000000000000000000001", name: "Test Salon One", ownerKey: "owner1" };
export const PROVIDER = { id: "p_00000000000000000000000000000001", name: "Test Plumber One", userKey: "provider1" };
/**
 * Phone numbers that accept the staging test OTP but have NO seeded account: signing in with one creates a brand-new
 * user, which is what the customer-onboarding journey needs. A reseed (--reset) deletes every staging auth user, so the
 * pool is fresh on each full run; the spec takes the first number that has no account yet.
 */
export const NEWCOMER_PHONES = ["+919000000011", "+919000000012", "+919000000013", "+919000000014", "+919000000015"];

/** A retail shop (package "shop": countable products, cart, bulk-buying campaigns) — also owned by owner1. */
export const SHOP = { id: "b_00000000000000000000000000000002", name: "Test Kirana One", ownerKey: "owner1" };
