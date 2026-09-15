import { test, expect, loadStagingEnv } from "../fixtures/staging";

// E2E-040: the notifications insert policy let any signed-in user write — and push — a notification into anyone's
// inbox. Needs migration 20260980 (applied on staging 2026-09-16; production apply pending owner approval).
const CUSTOMER2_ID = "00000000-0000-4000-8000-000000000002";
const CUSTOMER1_ID = "00000000-0000-4000-8000-000000000001";

test("notifications: a user can't send a notification to someone else", async ({ customer }) => {
  const env = loadStagingEnv();
  await customer.goto("/notifications");
  const token = await customer.evaluate((ref) => JSON.parse(localStorage.getItem(`sb-${ref}-auth-token`) || "{}").access_token, env.STAGING_REF);
  expect(token, "customer1 session token").toBeTruthy();
  const headers = { apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: "return=representation" };
  const notice = { type: "SYSTEM", title: "STRYT admin", body: "Your account is suspended. Verify now.", deep_link: "/settings" };

  const spoof = await customer.request.post(`${env.VITE_SUPABASE_URL}/rest/v1/notifications`, { headers, data: { ...notice, user_id: CUSTOMER2_ID } });
  expect(spoof.status(), await spoof.text()).toBe(403);

  const nudge = await customer.request.post(`${env.VITE_SUPABASE_URL}/rest/v1/rpc/request_payment_nudge`, {
    headers,
    data: { p_kind: "QUEUE", p_id: "00000000-0000-4000-8000-00000000abcd" },
  });
  expect(nudge.status()).toBeGreaterThanOrEqual(400);
  expect(await nudge.text()).toContain("NOT_FOUND");

  // Writing to your own inbox is still allowed (and tidied away).
  const own = await customer.request.post(`${env.VITE_SUPABASE_URL}/rest/v1/notifications`, { headers, data: { ...notice, title: "e2e self note", user_id: CUSTOMER1_ID } });
  expect(own.status(), await own.text()).toBe(201);
  const [{ id }] = await own.json();
  const del = await customer.request.delete(`${env.VITE_SUPABASE_URL}/rest/v1/notifications?id=eq.${id}`, { headers });
  expect(del.ok()).toBe(true);
});
