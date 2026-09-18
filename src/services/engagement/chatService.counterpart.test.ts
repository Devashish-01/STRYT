import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabaseClient", () => ({ getSupabase: vi.fn(), currentUserId: vi.fn() }));

import { resolveOther } from "./chatService";
import type { Conversation } from "@/types";

/**
 * Who a chat shows as "the other side", and where its "View contact" goes. A customer who messaged a shop or a
 * provider must land on that listing's page — it used to open the owner's personal profile.
 */

const OWNER = "u-owner";
const CUSTOMER = "u-customer";

const conv = (over: Partial<Conversation> = {}): Conversation => ({
  id: "c1", participantA: CUSTOMER, participantB: OWNER, lastMessageAt: "", lastMessagePreview: "",
  hasUnreadA: false, hasUnreadB: false, createdAt: "", ...over,
});
const person = (id: string, name: string) => ({ id, name, avatar: `${id}.png` });

describe("the other side of a chat, and where its profile is", () => {
  it("a customer messaging a business sees the business, and opens the business page", () => {
    const c = conv({ subjectType: "business", subjectId: "b1", subjectName: "Test Salon", subjectAvatar: "logo.png", subjectOwnerId: OWNER });
    expect(resolveOther(c, CUSTOMER, person(OWNER, "Owner Person"))).toEqual({
      id: OWNER, name: "Test Salon", avatar: "logo.png", profilePath: "/business/b1", kind: "business",
    });
  });

  it("a customer messaging a provider opens the provider page", () => {
    const c = conv({ subjectType: "provider", subjectId: "p1", subjectName: "Ravi Plumbing", subjectOwnerId: OWNER });
    const other = resolveOther(c, CUSTOMER, person(OWNER, "Ravi"));
    expect(other).toMatchObject({ name: "Ravi Plumbing", profilePath: "/provider/p1", kind: "provider" });
  });

  it("never sends a customer to the owner's personal profile", () => {
    const c = conv({ subjectType: "business", subjectId: "b1", subjectName: "Test Salon", subjectOwnerId: OWNER });
    expect(resolveOther(c, CUSTOMER, person(OWNER, "Owner Person")).profilePath).not.toContain(OWNER);
  });

  it("the owner sees the customer, and opens the customer's profile", () => {
    const c = conv({ subjectType: "business", subjectId: "b1", subjectName: "Test Salon", subjectOwnerId: OWNER });
    expect(resolveOther(c, OWNER, person(CUSTOMER, "Asha"))).toEqual({
      id: CUSTOMER, name: "Asha", avatar: `${CUSTOMER}.png`, profilePath: `/u/${CUSTOMER}`, kind: "user",
    });
  });

  it("a plain chat between two people is unchanged", () => {
    expect(resolveOther(conv(), CUSTOMER, person(OWNER, "Friend"))).toMatchObject({
      name: "Friend", profilePath: `/u/${OWNER}`, kind: "user",
    });
  });

  it("an older listing chat with no recorded owner still opens the listing for the other side", () => {
    const c = conv({ subjectType: "provider", subjectId: "p9", subjectName: null, subjectOwnerId: null });
    expect(resolveOther(c, CUSTOMER)).toMatchObject({ name: "Provider", profilePath: "/provider/p9", kind: "provider" });
  });

  it("falls back to a generic person when the profile could not be read", () => {
    expect(resolveOther(conv(), CUSTOMER)).toEqual({
      id: OWNER, name: "STRYT user", avatar: "", profilePath: `/u/${OWNER}`, kind: "user",
    });
  });
});

describe("the chat screen uses it", () => {
  it("links the header and View contact through profilePath, not a hard-coded /u/ path", async () => {
    const { readFileSync } = await vi.importActual<typeof import("node:fs")>("node:fs");
    const src = readFileSync("src/screens/chat/ChatThread.tsx", "utf8");
    expect(src).not.toMatch(/nav\(`\/u\/\$\{other\.id\}`\)/);
    expect(src.match(/nav\(other\.profilePath\)/g)?.length).toBe(2);
  });
});
