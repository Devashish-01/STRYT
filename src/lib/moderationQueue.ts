import type { AdminReport } from "@/services/core/adminService";

/**
 * The moderation queue groups open reports by what they are about. Five people reporting one post is one decision,
 * not five cards; and the count of different people is what hides a post (20260990), so it is what the moderator
 * needs to see.
 */

export type Priority = "urgent" | "high" | "normal" | "low";

/** What the queue knows about a reported post or comment beyond its reports. */
export interface HiddenState {
  hiddenAt: string | null;
  hiddenReason: "REPORTS" | "AUTO_CHECK" | "REMOVED" | null;
  /** The start of its text. A comment or review has no screen of its own, so without this a moderator could not read it. */
  preview?: string;
  /** Where it can be read in context: a comment's post, a review's business or provider, a deal's business. */
  link?: string;
}

export interface ModerationItem {
  key: string;
  targetType: string;
  targetId: string;
  targetName: string;
  /** The open reports on it, newest first. */
  reports: AdminReport[];
  /** Different people who reported it. The automatic check is not a person. */
  reporterCount: number;
  /** The automatic check filed one of the reports. */
  automatic: boolean;
  hidden: boolean;
  hiddenReason: HiddenState["hiddenReason"];
  /** The distinct reasons given, in the order first seen. */
  reasons: string[];
  /** The start of its text, when it still exists. */
  preview: string | null;
  /** Where to read it in context, when it has somewhere. */
  link: string | null;
}

/** The reason code the automatic check files under. */
export const AUTO_CHECK_REASON = "AUTO_CHECK";

export const moderationKey = (targetType: string, targetId: string) => `${targetType}:${targetId}`;

/** Groups open reports by target. Input order (newest first) is kept inside each group and between groups. */
export function groupReports(reports: AdminReport[], hidden: Record<string, HiddenState>): ModerationItem[] {
  const items = new Map<string, ModerationItem>();
  const people = new Map<string, Set<string>>();
  for (const r of reports) {
    const key = moderationKey(r.targetType, r.targetId);
    let item = items.get(key);
    if (!item) {
      const h = hidden[key];
      item = {
        key,
        targetType: r.targetType,
        targetId: r.targetId,
        targetName: r.targetName,
        reports: [],
        reporterCount: 0,
        automatic: false,
        hidden: !!h?.hiddenAt,
        hiddenReason: h?.hiddenAt ? h.hiddenReason : null,
        reasons: [],
        preview: h?.preview ?? null,
        link: h?.link ?? null,
      };
      items.set(key, item);
      people.set(key, new Set());
    }
    item.reports.push(r);
    if (r.reason === AUTO_CHECK_REASON) item.automatic = true;
    else if (r.reporterUserId) people.get(key)!.add(r.reporterUserId);
    if (!item.reasons.includes(r.reason)) item.reasons.push(r.reason);
  }
  for (const [key, item] of items) item.reporterCount = people.get(key)!.size;
  return [...items.values()];
}

const RANK: Record<Priority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

/**
 * The order a moderator works in: what is already hidden first (someone is waiting on the decision), then by the
 * classifier's priority where there is one (none counts as normal), then by how many people reported it. Ties keep
 * their incoming order.
 */
export function orderQueue(items: ModerationItem[], priorities: Record<string, Priority | undefined>): ModerationItem[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) =>
      Number(b.item.hidden) - Number(a.item.hidden) ||
      RANK[priorities[a.item.key] ?? "normal"] - RANK[priorities[b.item.key] ?? "normal"] ||
      b.item.reporterCount - a.item.reporterCount ||
      a.index - b.index,
    )
    .map(({ item }) => item);
}
