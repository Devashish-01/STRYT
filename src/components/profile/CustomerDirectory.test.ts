import { describe, expect, it } from "vitest";
import { filterDirectoryGroups, type DirectoryGroup } from "./directoryFilter";

const sampleGroups: DirectoryGroup[] = [
  {
    id: "activity",
    title: "How you use STRYT",
    rows: [
      { id: "saved", label: "Saved", value: "3", keywords: "bookmarks favorites", onClick: () => {} },
      { id: "queues", label: "Walk-in queues", badge: "1 active", keywords: "wait tokens", onClick: () => {} },
    ],
  },
  {
    id: "profiles",
    title: "Profiles & selling",
    slot: "hat-switcher",
    rows: [
      { id: "team", label: "Team & access", hint: "Manage shop staff permissions", onClick: () => {} },
    ],
  },
  {
    id: "login",
    title: "Login",
    rows: [
      { id: "logout", label: "Log out", tone: "danger", onClick: () => {} },
    ],
  },
];

describe("filterDirectoryGroups", () => {
  it("preserves all groups and embedded slots when search is empty or whitespace", () => {
    expect(filterDirectoryGroups(sampleGroups, "")).toEqual(sampleGroups);
    expect(filterDirectoryGroups(sampleGroups, "   ")).toEqual(sampleGroups);
  });

  it("matches by label, hint, keywords, or section title and hides empty groups + slots", () => {
    const byKeyword = filterDirectoryGroups(sampleGroups, "bookmarks");
    expect(byKeyword.map((g) => g.id)).toEqual(["activity"]);
    expect(byKeyword[0].rows.map((r) => r.id)).toEqual(["saved"]);

    const byHint = filterDirectoryGroups(sampleGroups, "STAFF");
    expect(byHint).toHaveLength(1);
    expect(byHint[0].id).toBe("profiles");
    expect(byHint[0].slot).toBeUndefined();
  });

  it("returns empty array when nothing matches", () => {
    expect(filterDirectoryGroups(sampleGroups, "nonexistent-xyz")).toEqual([]);
  });
});
