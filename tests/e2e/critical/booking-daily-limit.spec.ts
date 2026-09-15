import { test, expect, uid, loadStagingEnv } from "../fixtures/staging";
import { bookSlot, pickDay } from "../fixtures/booking";
import { BUSINESS } from "../../../scripts/staging/personas.mjs";

// A customer can hold at most 5 active appointments per day. The 6th is refused in the booking sheet with a clear
// message, and the server refuses it too when the sheet is bypassed.
test("booking: the 6th same-day booking is refused with a clear message", async ({ customer2 }, testInfo) => {
  const day = 2 + testInfo.repeatEachIndex;
  const tag = uid();
  for (let i = 0; i < 5; i++) {
    await bookSlot(customer2, { target: `/business/${BUSINESS.id}`, item: "Test Haircut", dayOffset: day, time: `${1 + i}:00 PM`, note: `e2e limit ${tag} #${i + 1}` });
    await expect(customer2.getByText(/booked for/i)).toBeVisible();
  }

  // Sheet: the limit warning shows and confirming is disabled.
  await customer2.goto(`/business/${BUSINESS.id}`);
  await customer2.getByRole("button", { name: "Book Appointment", exact: true }).click();
  await pickDay(customer2, day);
  await expect(customer2.getByText("You've reached the limit of 5 appointments for this day. Please pick another date.")).toBeVisible();
  await expect(customer2.getByRole("button", { name: "Daily Limit Exceeded" })).toBeDisabled();

  // Server: calling the booking RPC directly with the customer's own session is refused with the same message.
  const env = loadStagingEnv();
  const token = await customer2.evaluate((ref) => JSON.parse(localStorage.getItem(`sb-${ref}-auth-token`) || "{}").access_token, env.STAGING_REF);
  expect(token, "customer2 session token").toBeTruthy();
  const when = new Date();
  when.setDate(when.getDate() + day);
  when.setHours(20, 0, 0, 0);
  const res = await customer2.request.post(`${env.VITE_SUPABASE_URL}/rest/v1/rpc/appointment_create`, {
    headers: { apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    data: { p_target_type: "BUSINESS", p_target_id: BUSINESS.id, p_scheduled_for: when.toISOString(), p_date_label: "limit", p_time_label: "8:00 PM", p_notes: `e2e limit ${tag} #6` },
  });
  expect(res.status()).toBeGreaterThanOrEqual(400);
  expect(await res.text()).toContain("limit of 5 appointments");
});
