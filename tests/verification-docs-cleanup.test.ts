import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";

/**
 * Tests the verification-document cleanup exactly as it ships.
 *
 * The edge functions inline their helpers on purpose — each "deploys standalone via the Supabase dashboard" —
 * so there is no module to import. Instead this reads the marked block out of each function file, checks the
 * two copies are identical, strips the types with esbuild, and runs the real code against a fake storage
 * client. A test of a copy would prove the copy works; this proves what gets deployed works.
 *
 * What is at stake: these are Aadhaar, PAN and business-proof documents. The retention policy promises they
 * are deleted with the account. Before this helper existed, nothing deleted them.
 */

const FILES = {
  purge: "supabase/functions/purge-deleted-accounts/index.ts",
  admin: "supabase/functions/admin-delete-profile/index.ts",
};
const START = "// >>> verification-docs cleanup";
const END = "// <<< verification-docs cleanup";

function source(file: string): string {
  return readFileSync(file, "utf8").replace(/\r\n/g, "\n");
}

function block(file: string): string {
  const src = source(file);
  const a = src.indexOf(START);
  const b = src.indexOf(END);
  if (a < 0 || b < 0) throw new Error(`markers missing in ${file}`);
  return src.slice(a, b + END.length);
}

type Helper = (sb: unknown, opts: { ownerId?: string; paths?: unknown[] }) => Promise<number>;

function load(file: string): Helper {
  const js = transformSync(block(file), { loader: "ts" }).code;
  return new Function(`${js}\nreturn removeVerificationDocs;`)() as Helper;
}

type Entry = { name: string; id: string | null };

/** A storage client that serves a fixed tree and records what it was asked to remove. */
function fakeStorage(tree: Record<string, Entry[]>, fail: { list?: string; remove?: boolean } = {}) {
  const removed: string[][] = [];
  const listed: string[] = [];
  const buckets: string[] = [];
  const bucket = {
    list: async (prefix: string) => {
      listed.push(prefix);
      if (fail.list === prefix) return { data: null, error: { message: "list failed" } };
      return { data: tree[prefix] ?? [], error: null };
    },
    remove: async (paths: string[]) => {
      removed.push(paths);
      return fail.remove ? { data: null, error: { message: "remove failed" } } : { data: [], error: null };
    },
  };
  const sb = {
    storage: {
      from: (name: string) => {
        buckets.push(name);
        return bucket;
      },
    },
  };
  return { sb, removed, listed, buckets };
}

const helper = load(FILES.purge);

describe("the shipped helper", () => {
  it("is byte-identical in both edge functions", () => {
    expect(block(FILES.admin)).toBe(block(FILES.purge));
  });

  it("only ever touches the verification-docs bucket", async () => {
    const s = fakeStorage({ u1: [{ name: "verification", id: null }], "u1/verification": [{ name: "a.jpg", id: "1" }] });
    await helper(s.sb, { ownerId: "u1" });
    expect(new Set(s.buckets)).toEqual(new Set(["verification-docs"]));
  });
});

describe("whole-account deletion (ownerId)", () => {
  it("removes every document in every kind folder", async () => {
    const s = fakeStorage({
      u1: [
        { name: "verification", id: null },
        { name: "business-proof", id: null },
      ],
      "u1/verification": [
        { name: "aadhaar.jpg", id: "1" },
        { name: "pan.jpg", id: "2" },
      ],
      "u1/business-proof": [{ name: "gst.pdf", id: "3" }],
    });
    const n = await helper(s.sb, { ownerId: "u1" });
    expect(n).toBe(3);
    expect(s.removed.flat().sort()).toEqual(
      ["u1/business-proof/gst.pdf", "u1/verification/aadhaar.jpg", "u1/verification/pan.jpg"].sort(),
    );
  });

  it("also removes a file sitting directly under the user's folder", async () => {
    const s = fakeStorage({ u1: [{ name: "stray.jpg", id: "9" }] });
    await helper(s.sb, { ownerId: "u1" });
    expect(s.removed.flat()).toEqual(["u1/stray.jpg"]);
  });

  it("never lists or removes anything outside that user's folder", async () => {
    const s = fakeStorage({
      u1: [{ name: "verification", id: null }],
      "u1/verification": [{ name: "a.jpg", id: "1" }],
      u2: [{ name: "verification", id: null }],
      "u2/verification": [{ name: "b.jpg", id: "2" }],
    });
    await helper(s.sb, { ownerId: "u1" });
    expect(s.listed.every((p) => p === "u1" || p.startsWith("u1/"))).toBe(true);
    expect(s.removed.flat().every((p) => p.startsWith("u1/"))).toBe(true);
  });

  it("does nothing, and makes no remove call, when the user has no documents", async () => {
    const s = fakeStorage({});
    expect(await helper(s.sb, { ownerId: "u1" })).toBe(0);
    expect(s.removed).toHaveLength(0);
  });
});

describe("single-profile deletion (paths)", () => {
  it("removes exactly the recorded paths", async () => {
    const s = fakeStorage({});
    await helper(s.sb, { paths: ["u1/verification/a.jpg", "u1/verification/b.jpg"] });
    expect(s.removed.flat()).toEqual(["u1/verification/a.jpg", "u1/verification/b.jpg"]);
  });

  it("does not list the owner's folder, which another profile's documents share", async () => {
    const s = fakeStorage({ u1: [{ name: "verification", id: null }] });
    await helper(s.sb, { paths: ["u1/verification/a.jpg"] });
    expect(s.listed).toHaveLength(0);
  });

  it("ignores legacy URLs, empty and non-string values, and duplicates", async () => {
    const s = fakeStorage({});
    // verification_document_url is paths[0], so the same path arrives twice in practice.
    await helper(s.sb, {
      paths: ["u1/verification/a.jpg", "u1/verification/a.jpg", "https://x.supabase.co/old.jpg", "", "  ", null, undefined, 42],
    });
    expect(s.removed.flat()).toEqual(["u1/verification/a.jpg"]);
  });
});

describe("failure is loud, never quiet", () => {
  // A deletion that could not remove an identity document must not be recorded as complete.
  it("throws when listing fails", async () => {
    const s = fakeStorage({ u1: [{ name: "verification", id: null }] }, { list: "u1/verification" });
    await expect(helper(s.sb, { ownerId: "u1" })).rejects.toThrow(/could not list/);
  });

  it("throws when removal fails", async () => {
    const s = fakeStorage({ u1: [{ name: "x.jpg", id: "1" }] }, { remove: true });
    await expect(helper(s.sb, { ownerId: "u1" })).rejects.toThrow(/could not remove/);
  });
});

describe("where it is called", () => {
  it("purge removes documents before anonymising the user, so a failure leaves the request retryable", () => {
    const src = source(FILES.purge);
    const call = src.indexOf("await removeVerificationDocs(sb, { ownerId: targetId })");
    const anonymise = src.indexOf('await sb.from("users").update({', src.indexOf("async function purgeCustomerAccount("));
    expect(call).toBeGreaterThan(0);
    expect(anonymise).toBeGreaterThan(call);
  });

  it("the admin tool covers all three deletion paths", () => {
    const src = source(FILES.admin);
    expect(src.match(/await removeVerificationDocs\(sb, \{ ownerId: targetId \}\)/g)).toHaveLength(1);
    expect(src).toContain('from("businesses")\n        .select("verification_documents, verification_document_url")');
    expect(src).toContain('from("providers")\n        .select("verification_documents, verification_document_url")');
  });
});
