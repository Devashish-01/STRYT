import { test, expect, uid, expectAfterReload } from "../fixtures/staging";
import { stagingQuery, lit, hasDb } from "../fixtures/db";

// A customer reports another customer's request with details → the admin sees the report with those details
// (E2E-030) → removes it (20260991: the request is cancelled and stays hidden) → the report leaves the queue and the
// reporter is told it was reviewed. Reporting a request made inside the test keeps the shared test salon untouched.
test("admin moderation: report with details, admin takes action, reporter is told", async ({ customer, customer2, admin }) => {
  test.skip(!hasDb(), "needs the staging DB helper token to read ids");
  const title = `Suspicious offer ${uid()}`;
  const details = `Asks for payment upfront via link ${uid()}`;

  await customer.goto("/ask");
  await customer.getByPlaceholder("e.g. Need a custom birthday cake for Sunday").fill(title);
  await customer.getByRole("button", { name: "📦 Other" }).click();
  await customer.getByRole("button", { name: "Post request" }).click();
  await expect(customer).toHaveURL(/\/explore\?tab=requests/);
  const [req] = await stagingQuery<{ id: string }>(`select id from public.requests where title = ${lit(title)}`);

  // customer2 reports it.
  await customer2.goto(`/request/${req.id}`);
  await customer2.getByRole("button", { name: "Report this request" }).click();
  await customer2.getByRole("button", { name: "Looks like a scam" }).click();
  await customer2.getByPlaceholder("Add details (optional)").fill(details);
  await customer2.getByRole("button", { name: "Submit report" }).click();
  await expect(customer2.getByText("Report submitted. Thank you.")).toBeVisible();

  // Admin: the report is queued with the reporter's details.
  await admin.goto("/admin");
  await admin.getByRole("button", { name: "Reports", exact: true }).click();
  const report = () => admin.locator("div.card").filter({ hasText: details });
  await expectAfterReload(admin, async () => {
    await admin.getByRole("button", { name: "Reports", exact: true }).click();
    return report();
  });
  await expect(report().getByText(title)).toBeVisible();
  // One card per reported thing (20260990): it counts the people, and shows each note with who wrote it.
  await expect(report().getByText(/reported by 1 person/)).toBeVisible();
  await expect(report().getByText(/Test Customer Two:/)).toBeVisible();
  await report().getByRole("button", { name: "Remove" }).click();
  await expect(report()).toHaveCount(0);

  // The request is cancelled for its owner, and the reporter hears back.
  await expect
    .poll(async () => (await stagingQuery<{ status: string }>(`select status from public.requests where id = ${lit(req.id)}`))[0]?.status)
    .toBe("CANCELLED");
  await customer2.goto("/notifications");
  // Sent by the database when the report closes (notify_on_report_resolved), not by the admin's browser.
  await expectAfterReload(customer2, () => customer2.getByText(/Report reviewed/).first());

  // Audit trail (E2E-031): the admin's cancellation and the closed report are both recorded against the admin.
  const audit = await stagingQuery<{ target_type: string; to: string }>(
    `select a.target_type, a.details->'changes'->'status'->>'to' as "to"
       from public.admin_actions a join public.users u on u.id = a.admin_user_id
      where 'admin' = any(u.roles) and a.target_id in (${lit(req.id)}, (select id from public.reports where target_id = ${lit(req.id)} limit 1))
      order by a.target_type`,
  );
  expect(audit).toEqual([
    { target_type: "reports", to: "ACTION_TAKEN" },
    { target_type: "requests", to: "CANCELLED" },
  ]);
});
