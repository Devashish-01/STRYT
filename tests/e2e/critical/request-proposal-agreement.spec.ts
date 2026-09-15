import type { Page } from "@playwright/test";
import { test, expect, uid, expectAfterReload } from "../fixtures/staging";
import { stagingQuery, lit, hasDb } from "../fixtures/db";
import { PROVIDER } from "../../../scripts/staging/personas.mjs";

const PROVIDER_CONSOLE = `/provider/${PROVIDER.id}`;

/** Waits for the agreement screen to finish loading, then clicks one of its actions. */
async function agreementAction(page: Page, agreementPath: string, action: string | RegExp) {
  await page.goto(agreementPath);
  await expect(page.getByText("Terms & scope")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: action }).click();
}

// The whole marketplace loop between a customer and a provider:
// customer asks → the plumber sees it in Find work (E2E-019) and is notified → proposes as the provider (E2E-022) →
// customer counters (E2E-023) → provider accepts the counter → both confirm the agreement → customer claims a cash
// payment → provider confirms → work started → submitted for review → customer approves → customer rates the
// provider, and the rating lands on the provider's reviews (E2E-027). Names shown are the provider's (E2E-026).
test("request → proposal → counter → agreement → payment → completion → rating", async ({ customer, provider }) => {
  test.skip(!hasDb(), "needs the staging DB helper token to read ids");
  const tag = uid();
  const title = `Kitchen tap replacement ${tag}`;
  const pitch = `Brass tap, fitted and tested ${tag}`;
  const review = `Quick and tidy ${tag}`;

  // Customer posts a Home & Repair request.
  await customer.goto("/ask");
  await customer.getByPlaceholder("e.g. Need a custom birthday cake for Sunday").fill(title);
  await customer.getByRole("button", { name: "🔧 Home" }).click();
  await customer.getByRole("button", { name: "Post request" }).click();
  await expect(customer).toHaveURL(/\/explore\?tab=requests/);
  const [req] = await stagingQuery<{ id: string }>(`select id from public.requests where title = ${lit(title)}`);
  expect(req, "request row").toBeTruthy();

  // Provider (a plumber, category c-home-plumb): notified, and the request is in Find work.
  await provider.goto("/notifications");
  await expectAfterReload(provider, () => provider.getByRole("button", { name: new RegExp(`New Home & Repair request.*${title}`) }));
  await provider.getByRole("button", { name: new RegExp(`New Home & Repair request.*${title}`) }).first().click();
  await expect(provider).toHaveURL(new RegExp(`${PROVIDER_CONSOLE}/manage/find-work`));
  await provider.getByText(title).first().click();
  await provider.getByRole("button", { name: "Send a proposal" }).click();
  await provider.getByRole("textbox", { name: "0" }).fill("700");
  await provider.getByPlaceholder("e.g. Deliver by Saturday 5 PM").fill("Tomorrow 11 AM");
  await provider.getByPlaceholder(/Tell them why/).fill(pitch);
  await provider.getByRole("button", { name: /^Send proposal • / }).click();
  await expect(provider.getByText("Proposal sent!")).toBeVisible();

  // Sent as the provider: listed in the console's Sent tab.
  await provider.goto(`${PROVIDER_CONSOLE}/manage/find-work`);
  await provider.getByRole("button", { name: /Sent/ }).click();
  await expect(provider.getByText(title).first()).toBeVisible();

  // Customer sees the offer from "Test Plumber One" and counters at ₹600.
  await customer.goto(`/request/${req.id}`);
  const offer = customer.locator("div").filter({ hasText: pitch }).filter({ has: customer.getByRole("button", { name: "Counter", exact: true }) }).last();
  await expect(offer.getByText("Test Plumber One")).toBeVisible();
  await offer.getByRole("button", { name: "Counter", exact: true }).click();
  await customer.getByPlaceholder("e.g. 650").fill("600");
  await customer.getByRole("button", { name: "Send", exact: true }).click();
  await expect(customer.getByText(/Requester counter: ₹600/)).toBeVisible();

  // Provider accepts the counter → the agreement opens.
  await provider.goto(`/request/${req.id}`);
  await expectAfterReload(provider, () => provider.getByRole("button", { name: "Accept at ₹600" }));
  await provider.getByRole("button", { name: "Accept at ₹600" }).click();
  await expect(provider).toHaveURL(/\/agreement\/ag_/);
  const agreementPath = new URL(provider.url()).pathname;
  await expect(provider.getByText("₹600").first()).toBeVisible();
  await expect(provider.getByText("within 12 hours")).toBeVisible();

  // Customer: the deal is with the provider, not the person behind it; confirms.
  await customer.goto("/agreements");
  await expect(customer.getByRole("button", { name: new RegExp(`${title}.*Test Plumber One`) })).toBeVisible();
  await agreementAction(customer, agreementPath, "Confirm & proceed");
  await expect(customer.getByRole("button", { name: "I've paid in cash" })).toBeVisible();

  // Customer claims cash → provider confirms receipt.
  await customer.getByRole("button", { name: "I've paid in cash" }).click();
  await expect(customer.getByText("Waiting for Test Plumber One to confirm payment…")).toBeVisible();
  await agreementAction(provider, agreementPath, "Confirm received");
  await expect(provider.getByRole("button", { name: "Mark work started" })).toBeVisible();

  // Work started → submitted for review → customer approves → rating screen.
  await provider.getByRole("button", { name: "Mark work started" }).click();
  await expect(provider.getByRole("button", { name: "Submit for review" })).toBeVisible();
  await provider.getByRole("button", { name: "Submit for review" }).click();
  await expect(provider.getByText("Waiting for Test Customer One to approve…")).toBeVisible();

  await agreementAction(customer, agreementPath, "Approve & complete");
  await expect(customer).toHaveURL(/\/rate\/ag_/);
  await expect(customer.getByRole("heading", { name: "How was Test Plumber One?" })).toBeVisible();
  await customer.getByRole("button", { name: "5 stars", exact: true }).click();
  await customer.getByPlaceholder("Share more about your experience (optional)").fill(review);
  await customer.getByRole("button", { name: /^Submit/ }).click();
  await expect(customer.getByText("Thanks! Your rating builds local trust.")).toBeVisible();

  // The rating is the provider's: on its reviews console.
  await provider.goto(`${PROVIDER_CONSOLE}/manage/reviews`);
  await expectAfterReload(provider, () => provider.getByText(review));
});
