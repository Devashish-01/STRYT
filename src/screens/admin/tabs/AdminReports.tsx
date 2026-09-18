import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { adminService, type ReportTriage } from "@/services/core/adminService";
import { useQueryWithRealtime } from "@/hooks/useApi";
import { ListSkeleton } from "@/components/states";
import { Flag } from "@/components/Icons";
import { useApp } from "@/store";
import { getSupabase } from "@/lib/supabaseClient";
import { errorMessage } from "@/lib/errorMessage";
import { AUTO_CHECK_REASON, orderQueue, type ModerationItem, type Priority } from "@/lib/moderationQueue";

/**
 * The moderation queue: one card per reported thing, not per report.
 *
 * Community posts and comments get the two decisions from 20260990 — Remove, or No action (restore it and close
 * every report on it). They may already be hidden: after five different people report them, or by the automatic
 * check. Everything else keeps the per-type action it had.
 */
const COMMUNITY = new Set(["POST", "COMMENT"]);

const PRIORITY_BADGE: Record<Priority, string> = {
  urgent: "badge-red",
  high: "badge-amber",
  normal: "badge-gray",
  low: "badge-gray",
};

export function AdminReports() {
  const { data, loading } = useQueryWithRealtime<ModerationItem[]>(() => adminService.moderationQueue(), "reports", []);
  const { showToast } = useApp();
  const nav = useNavigate();
  const [done, setDone] = useState<Record<string, "ACTION_TAKEN" | "DISMISSED">>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [triage, setTriage] = useState<Record<string, ReportTriage>>({});
  const requested = useRef(new Set<string>());

  // The classifier's label and priority, once per community item, from its newest user report. Best-effort: with
  // the moderation function not deployed or configured, nothing appears and the queue works as before.
  useEffect(() => {
    for (const item of data ?? []) {
      if (!COMMUNITY.has(item.targetType) || requested.current.has(item.key)) continue;
      const report = item.reports.find((r) => r.reason !== AUTO_CHECK_REASON);
      if (!report) continue;
      requested.current.add(item.key);
      void adminService.classifyReport(report.id).then((result) => {
        if (result) setTriage((t) => ({ ...t, [item.key]: result }));
      });
    }
  }, [data]);

  const items = useMemo(() => {
    const priorities = Object.fromEntries(Object.entries(triage).map(([key, t]) => [key, t.priority]));
    return orderQueue(data ?? [], priorities);
  }, [data, triage]);

  /** Where a moderator can read the reported thing in context (MOD-4). A comment is read on its post. */
  function targetLink(item: ModerationItem): string | null {
    switch (item.targetType) {
      case "POST": return `/community/${item.targetId}`;
      case "COMMENT": return item.postId ? `/community/${item.postId}` : null;
      case "REQUEST": return `/request/${item.targetId}`;
      case "BUSINESS": return `/business/${item.targetId}`;
      case "PROVIDER": return `/provider/${item.targetId}`;
      case "USER": return `/u/${item.targetId}`;
      default: return null;
    }
  }

  async function run(item: ModerationItem, outcome: "ACTION_TAKEN" | "DISMISSED", work: () => Promise<void>, toast: string) {
    setBusy(item.key);
    try {
      await work();
      setDone((d) => ({ ...d, [item.key]: outcome }));
      showToast(toast);
    } catch (e) {
      showToast(errorMessage(e, "Couldn't save that decision — try again"));
    } finally {
      setBusy(null);
    }
  }

  /** Closes every open report in the group. */
  async function resolveAll(item: ModerationItem, status: "ACTION_TAKEN" | "DISMISSED") {
    for (const r of item.reports) await adminService.resolveReport(r.id, status);
  }

  // Non-community targets keep the action they had (flow-completeness audit, workflow 21): BUSINESS/PROVIDER are
  // suspended; REQUEST is soft-cancelled, never hard-deleted, since an agreement can hang off it. Anything without an
  // action stays open and says so (MOD-2; owner decision E2E-037).
  async function takeOtherAction(item: ModerationItem) {
    const sb = getSupabase();
    if (item.targetType === "BUSINESS" || item.targetType === "PROVIDER") {
      const table = item.targetType === "BUSINESS" ? "businesses" : "providers";
      const { error } = await sb.from(table).update({ status: "SUSPENDED" }).eq("id", item.targetId);
      if (error) throw error;
    } else if (item.targetType === "REQUEST") {
      const { error } = await sb.rpc("admin_cancel_request", { p_id: item.targetId });
      if (error) throw error;
    } else {
      throw new Error(`No automatic action for a reported ${item.targetType.toLowerCase()} yet — handle it directly, then dismiss.`);
    }
    await resolveAll(item, "ACTION_TAKEN");
  }

  function who(item: ModerationItem): string {
    const people = item.reporterCount === 1 ? "1 person" : `${item.reporterCount} people`;
    if (item.automatic && item.reporterCount === 0) return "flagged by the automatic check";
    return `reported by ${people}${item.automatic ? " and the automatic check" : ""}`;
  }

  return (
    <>
      {loading && <ListSkeleton count={3} />}
      {data && items.length === 0 && <p className="page-pad small muted">No open reports.</p>}
      {data && items.length > 0 && (
        <div className="page-pad col gap-12">
          {items.map((item) => {
            const outcome = done[item.key];
            const t = triage[item.key];
            const link = targetLink(item);
            const community = COMMUNITY.has(item.targetType);
            const notes = item.reports.filter((r) => r.details).slice(0, 3);
            return (
              <div key={item.key} className="card">
                <div className="row between" style={{ alignItems: "flex-start", gap: 8 }}>
                  <div className="row gap-6 wrap">
                    {item.reasons.map((reason) => (
                      <span key={reason} className="badge badge-red">
                        <Flag size={11} /> {reason === AUTO_CHECK_REASON ? "Automatic check" : reason}
                      </span>
                    ))}
                    {item.hidden && (
                      <span className="badge badge-amber">
                        Hidden {item.hiddenReason === "AUTO_CHECK" ? "by the automatic check" : "after reports"}
                      </span>
                    )}
                    {t && (
                      <span className={`badge ${PRIORITY_BADGE[t.priority]}`} title={t.reasons.join("; ")}>
                        {t.priority.toUpperCase()} · {t.category === "uncertain" ? (t.alternatives.join(" / ") || "unclear") : t.category.replace(/_/g, " ")}
                      </span>
                    )}
                  </div>
                  <span className="tiny muted" style={{ flexShrink: 0 }}>{item.reports[0].time}</span>
                </div>

                <div className="semi small" style={{ marginTop: 8 }}>{item.targetName}</div>
                <div className="tiny muted">{item.targetType} • {who(item)}</div>

                {item.preview && (
                  <p
                    className="small"
                    style={{ marginTop: 8, padding: "8px 10px", borderRadius: 10, background: "var(--ink-50)", whiteSpace: "pre-wrap" }}
                  >
                    {item.preview}
                  </p>
                )}
                {t?.support && (
                  <p className="small semi" style={{ marginTop: 6, color: "var(--red-600)" }}>
                    Possible self-harm — reach out to the author; don't only remove.
                  </p>
                )}
                {notes.map((r) => (
                  <p key={r.id} className="small" style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>
                    <span className="muted">{r.reporter}: </span>{r.details}
                  </p>
                ))}

                {link && (
                  <button
                    type="button"
                    className="tiny semi"
                    style={{ background: "none", border: "none", padding: "6px 0 0", color: "var(--brand-700)", cursor: "pointer" }}
                    onClick={() => nav(link)}
                  >
                    {item.targetType === "COMMENT" ? "Open the post it is on →" : `Open the reported ${item.targetType.toLowerCase()} →`}
                  </button>
                )}

                {outcome ? (
                  <span className={`badge ${outcome === "ACTION_TAKEN" ? "badge-red" : "badge-gray"}`} style={{ marginTop: 10 }}>
                    {outcome === "ACTION_TAKEN" ? (community ? "Removed" : "Action taken") : (community ? "No action — visible again" : "Dismissed")}
                  </span>
                ) : community ? (
                  <div className="row gap-8" style={{ marginTop: 12 }}>
                    <button
                      className="btn btn-outline grow btn-sm"
                      disabled={busy === item.key}
                      onClick={() => run(item, "DISMISSED", () => adminService.moderationRestore(item.targetType, item.targetId), "No action — it's visible again and the reports are closed")}
                    >
                      No action
                    </button>
                    <button
                      className="btn btn-sm grow"
                      style={{ background: "var(--red-500)", color: "#fff" }}
                      disabled={busy === item.key}
                      onClick={() => run(item, "ACTION_TAKEN", () => adminService.moderationRemove(item.targetType, item.targetId), "Removed")}
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="row gap-8" style={{ marginTop: 12 }}>
                    <button
                      className="btn btn-outline grow btn-sm"
                      disabled={busy === item.key}
                      onClick={() => run(item, "DISMISSED", () => resolveAll(item, "DISMISSED"), "Dismissed")}
                    >
                      Dismiss
                    </button>
                    <button
                      className="btn btn-sm grow"
                      style={{ background: "var(--red-500)", color: "#fff" }}
                      disabled={busy === item.key}
                      onClick={() => run(item, "ACTION_TAKEN", () => takeOtherAction(item), "Action taken")}
                    >
                      Take action
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
