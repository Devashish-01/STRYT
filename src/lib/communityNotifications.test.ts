import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Drift guard between the notification TRIGGERS and the client that renders them.
 *
 * The failure this exists to catch is silent and specific: a Postgres trigger
 * inserts a notification type the client has never heard of, so
 * `meta[n.type] ?? meta.SYSTEM` in Notifications.tsx quietly renders it as a
 * generic grey bell. Nothing errors, nothing logs, and the notification just
 * looks wrong forever. That was the situation for every community action except
 * comments before 20260896.
 *
 * These tests read the actual SQL and the actual TypeScript, so they fail when
 * the two disagree rather than asserting a hand-copied list.
 */

const ROOT = path.resolve(__dirname, "..", "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/** SQL with `--` comments removed, for assertions about what the migration DOES
 *  rather than what it explains. Without this, a comment that merely mentions
 *  `send-push` reads as a call to it. */
function readCode(rel: string): string {
  return read(rel)
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

function migrationFiles(): string[] {
  const dir = path.join(ROOT, "supabase", "migrations");
  return fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).map((f) => path.join("supabase", "migrations", f));
}

/** Every notification type any migration inserts, read from the SQL. */
function typesInsertedBySql(): Set<string> {
  const found = new Set<string>();
  for (const file of migrationFiles()) {
    const sql = read(file);
    // Both insert shapes used in this repo:
    //   values ( user_id, 'TYPE', ... )
    //   select uid, 'TYPE', ...
    // Matched loosely on an ALL_CAPS quoted literal following the recipient, then
    // filtered against the known union below so unrelated literals can't sneak in.
    for (const m of sql.matchAll(/'([A-Z][A-Z_]{3,})'/g)) {
      found.add(m[1]);
    }
  }
  return found;
}

/** The NotificationType union, read from the TypeScript. */
function unionTypes(): string[] {
  const src = read(path.join("src", "types", "user.ts"));
  const start = src.indexOf("export type NotificationType");
  expect(start).toBeGreaterThan(-1);
  const end = src.indexOf(";", start);
  const block = src.slice(start, end);
  return [...block.matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]);
}

/** The keys of the icon/tone map in Notifications.tsx. */
function metaKeys(): string[] {
  const src = read(path.join("src", "screens", "Notifications.tsx"));
  const start = src.indexOf("const meta: Record<NotificationType");
  expect(start).toBeGreaterThan(-1);
  const end = src.indexOf("\n};", start);
  const block = src.slice(start, end);
  return [...block.matchAll(/^\s{2}([A-Z_]+):\s*\{/gm)].map((m) => m[1]);
}

const COMMUNITY_LOOP_TYPES = [
  "COMMUNITY_COMMENT",
  "COMMUNITY_LIKE",
  "COMMUNITY_RECOMMENDATION",
  "COMMUNITY_RESOLVED",
  "COMMUNITY_POLL_ENDED",
  "COMMUNITY_MENTION",
  "NEARBY_ALERT",
] as const;

describe("the community notification loop is complete", () => {
  const union = unionTypes();

  it.each(COMMUNITY_LOOP_TYPES)("%s exists in the NotificationType union", (type) => {
    expect(union).toContain(type);
  });

  it.each(COMMUNITY_LOOP_TYPES)("%s has an icon and colour, so it never renders as a generic bell", (type) => {
    expect(metaKeys()).toContain(type);
  });

  it.each(COMMUNITY_LOOP_TYPES)("%s is actually inserted by a migration", (type) => {
    // A type in the union with no trigger behind it is a promise the backend
    // doesn't keep.
    expect(typesInsertedBySql()).toContain(type);
  });
});

describe("no notification type is orphaned", () => {
  it("every type a migration inserts is known to the client", () => {
    const union = new Set(unionTypes());
    const inserted = typesInsertedBySql();
    // Only consider literals that look like our notification types, so unrelated
    // ALL_CAPS strings in SQL (status values, error codes) are ignored.
    const suspects = [...inserted].filter(
      (t) => t.startsWith("COMMUNITY_") || t.startsWith("NEARBY_") || t.startsWith("QUEUE_") || t.startsWith("LOCATION_")
    );
    const unknown = suspects.filter((t) => !union.has(t));
    expect(unknown).toEqual([]);
  });

  it("every type in the union has UI metadata", () => {
    const missing = unionTypes().filter((t) => !metaKeys().includes(t));
    expect(missing).toEqual([]);
  });
});

describe("the nearby-alert fanout keeps its guardrails", () => {
  const sql = read(path.join("supabase", "migrations", "20260896_community_notification_loop.sql"));

  it("caps how many neighbours one alert can reach", () => {
    expect(sql).toMatch(/ALERT_FANOUT_CAP\s+constant\s+integer\s*:=\s*\d+/);
    expect(sql).toMatch(/limit ALERT_FANOUT_CAP/);
  });

  it("rate-limits how often one author can broadcast", () => {
    expect(sql).toMatch(/ALERT_RATE_LIMIT\s+constant\s+integer\s*:=\s*\d+/);
    expect(sql).toMatch(/if v_recent >= ALERT_RATE_LIMIT then/);
  });

  it("honours the per-user opt-out at insert time, not only at push time", () => {
    expect(sql).toMatch(/u\.notif_nearby_alerts/);
  });

  it("respects blocks in the fanout", () => {
    // Calls the internal pair-checker (20260892's _user_blocks_exists), not
    // the caller-bound is_blocked_between(text) wrapper: neither side of this
    // check is necessarily auth.uid(), since u.id is a candidate recipient
    // being enumerated by the query, not the calling session.
    expect(sql).toMatch(/_user_blocks_exists\(u\.id, new\.author_user_id\)/);
  });

  it("orders by distance so a capped fanout keeps the closest neighbours", () => {
    expect(sql).toMatch(/order by ST_Distance/);
  });

  it("only fans out for ALERT posts that have coordinates", () => {
    expect(sql).toMatch(/new\.type <> 'ALERT' or new\.geom is null/);
  });
});

describe("mentions can't be used to reach someone who blocked you", () => {
  const sql = read(path.join("supabase", "migrations", "20260896_community_notification_loop.sql"));

  it("checks the block relationship before notifying a mention", () => {
    expect(sql).toMatch(/not public\._user_blocks_exists\(m ->> 'userId'/);
  });

  it("reads resolved user ids rather than re-parsing the text", () => {
    // Parsing @handles at notification time would let someone spoof a mention by
    // typing text that looks like an alias.
    expect(sql).toMatch(/jsonb_array_elements\(new\.mentions\)/);
  });
});

describe("poll-end notification is safe to run repeatedly", () => {
  const sql = read(path.join("supabase", "migrations", "20260896_community_notification_loop.sql"));

  it("records that it already notified, so a re-run can't double-notify voters", () => {
    expect(sql).toMatch(/poll_ended_notified_at/);
    expect(sql).toMatch(/and poll_ended_notified_at is null/);
  });

  it("is not callable by a signed-in client", () => {
    // It writes notifications for other people.
    expect(sql).toMatch(/revoke all on function public\.notify_ended_polls\(\) from public, anon, authenticated/);
  });
});

describe("push is never fired twice", () => {
  it("no migration in the community loop calls the push function directly", () => {
    // Push is fired by the trigger on `notifications` itself
    // (20260731_push_on_every_notification), so inserting the row is enough.
    // A net.http_post / send-push call here would double-push.
    // Comments are stripped: the migration legitimately *discusses* send-push.
    const sql = readCode(path.join("supabase", "migrations", "20260896_community_notification_loop.sql"));
    expect(sql).not.toMatch(/net\.http_post/);
    expect(sql).not.toMatch(/send-push/);
  });
});
