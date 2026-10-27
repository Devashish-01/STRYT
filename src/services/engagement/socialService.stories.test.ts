import { beforeEach, describe, expect, it, vi } from "vitest";

// A fake of the Supabase query builder: every chained call is recorded, awaiting it yields the queued result.
type Result = { data?: unknown; error?: { code?: string; message?: string } | null };
const state = vi.hoisted(() => ({
  queue: {} as Record<string, unknown[]>,
  calls: [] as { table: string; method: string; args: unknown[] }[],
  removeFile: vi.fn(async () => true),
  uid: "me" as string | null,
}));

function builder(table: string, result: Result) {
  const q: unknown = new Proxy({}, {
    get: (_t, prop: string) => {
      if (prop === "then") return (resolve: (r: Result) => unknown) => resolve({ data: null, error: null, ...result });
      return (...args: unknown[]) => { state.calls.push({ table, method: prop, args }); return q; };
    },
  });
  return q;
}

vi.mock("@/lib/supabaseClient", () => ({
  currentUserId: async () => state.uid,
  getSupabase: () => ({
    from: (table: string) => builder(table, (state.queue[table]?.shift() as Result) ?? {}),
  }),
}));
vi.mock("@/services/core/uploadService", () => ({ uploadService: { remove: (...a: unknown[]) => state.removeFile(...(a as [])) } }));

import { socialService } from "./socialService";

const next = (table: string, ...results: Result[]) => { state.queue[table] = [...(state.queue[table] ?? []), ...results]; };
const called = (table: string, method: string) => state.calls.filter((c) => c.table === table && c.method === method);

beforeEach(() => {
  state.uid = "me";
  state.queue = {};
  state.calls = [];
  state.removeFile.mockClear();
});

describe("recordStoryView", () => {
  it("is a plain insert — an upsert is refused for a viewer — and a repeat view is not an error", async () => {
    next("story_views", { error: null });
    await socialService.recordStoryView("s1");
    expect(called("story_views", "insert")[0].args[0]).toEqual({ story_id: "s1", viewer_user_id: "me" });
    expect(called("story_views", "upsert")).toHaveLength(0);

    next("story_views", { error: { code: "23505" } });
    await expect(socialService.recordStoryView("s1")).resolves.toBeUndefined();
  });

  it("surfaces any other failure", async () => {
    next("story_views", { error: { code: "42501", message: "denied" } });
    await expect(socialService.recordStoryView("s1")).rejects.toMatchObject({ code: "42501" });
  });
});

describe("reactToStory", () => {
  it("updates the row the view created", async () => {
    next("story_views", { data: [{ id: "v1" }] });
    await socialService.reactToStory("s1", "🔥");
    expect(called("story_views", "update")[0].args[0]).toEqual({ reaction: "🔥" });
    expect(called("story_views", "insert")).toHaveLength(0);
  });

  it("inserts one with the reaction when there was no view row yet", async () => {
    next("story_views", { data: [] }, { error: null });
    await socialService.reactToStory("s1", "❤️");
    expect(called("story_views", "insert")[0].args[0]).toEqual({ story_id: "s1", viewer_user_id: "me", reaction: "❤️" });
  });

  it("says so when the reaction could not be saved (it used to fail silently)", async () => {
    next("story_views", { data: [] }, { error: { code: "23505" } });
    await expect(socialService.reactToStory("s1", "❤️")).rejects.toMatchObject({ code: "23505" });
  });
});

describe("deleteStory", () => {
  it("removes the row and then the photo", async () => {
    next("stories", { data: [{ id: "s1" }] });
    await socialService.deleteStory({ id: "s1", image: "https://x/y.jpg" });
    expect(called("stories", "delete")).toHaveLength(1);
    expect(state.removeFile).toHaveBeenCalledWith("https://x/y.jpg");
  });

  it("does not claim success — or touch the photo — when the database deleted nothing (not yours)", async () => {
    next("stories", { data: [] });
    await expect(socialService.deleteStory({ id: "s1", image: "https://x/y.jpg" })).rejects.toThrow("STORY_NOT_DELETED");
    expect(state.removeFile).not.toHaveBeenCalled();
  });
});

describe("postStory", () => {
  it("never writes an expiry beyond seven days, whatever the screen sent", async () => {
    next("stories", { error: null });
    const before = Date.now();
    await socialService.postStory({
      ownerType: "user", userId: "me", authorName: "a", authorAvatar: "", imageUrl: "i", caption: "", cta: "None", expiresInHrs: 100000,
    });
    const row = called("stories", "insert")[0].args[0] as { expires_at: string };
    const hours = (Date.parse(row.expires_at) - before) / 3_600_000;
    expect(hours).toBeLessThanOrEqual(168.01);
    expect(hours).toBeGreaterThan(167);
  });
});

describe("getStoryViewers", () => {
  it("shows the public alias, never the real name, unless the person opted in", async () => {
    next("story_views", {
      data: [
        { created_at: "2026-01-01T00:00:00Z", reaction: "🔥", viewer: { id: "a", name: "Asha Verma", alias: "asha_v", avatar: "", show_name_publicly: false } },
        { created_at: "2026-01-01T00:00:00Z", reaction: null, viewer: { id: "b", name: "Bhanu Rao", alias: "bhanu", avatar: "", show_name_publicly: true } },
      ],
    });
    const rows = await socialService.getStoryViewers("s1");
    expect(rows.map((r) => r.name)).toEqual(["asha_v", "Bhanu Rao"]);
  });
});

describe("myStoryMutes", () => {
  it("is empty — not an error — before the table exists", async () => {
    next("story_mutes", { error: { code: "42P01", message: "relation does not exist" } });
    expect((await socialService.myStoryMutes()).size).toBe(0);
  });

  it("keys mutes by owner type and id", async () => {
    next("story_mutes", { data: [{ owner_type: "business", owner_id: "b1" }, { owner_type: "user", owner_id: "u9" }] });
    expect([...(await socialService.myStoryMutes())].sort()).toEqual(["business:b1", "user:u9"]);
  });
});

describe("stories for a signed-out visitor", () => {
  const row = (id: string, visibility: string) => ({
    id, owner_type: "user", owner_id: "u1", user_id: "u1", author_name: "a", author_avatar: "", image_url: "i", caption: "", cta: "None",
    created_at: "2026-01-01T00:00:00Z", expires_at: "2099-01-01T00:00:00Z", visibility, allowed_user_ids: [], hidden_user_ids: [], is_highlighted: false,
  });

  it("sees the public ones — and never a close-friends story — instead of nothing", async () => {
    state.uid = null;
    next("stories", { data: [row("pub", "everyone"), row("close", "close_friends")] });
    const list = await socialService.stories();
    expect(list.map((s) => s.id)).toEqual(["pub"]);
  });
});
