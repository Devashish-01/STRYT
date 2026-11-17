import { useState } from "react";
import { EmptyState } from "@/components/common";
import { adminService } from "@/services/core/adminService";
import { useQueryWithRealtime } from "@/hooks/useApi";
import { ListSkeleton, ErrorView } from "@/components/states";
import { Check, X, Store, Briefcase, Tag, Mountains } from "@/components/Icons";
import PlaceRequestForm from "@/screens/places/PlaceRequestForm";
import { useApp } from "@/store";
import type { QueueType } from "../types";

export function AdminQueue() {
  const [type, setType] = useState<QueueType>("business");
  const queueTable = type === "business" ? "businesses" : type === "provider" ? "providers" : type === "place" ? "places" : "categories";
  const { data, loading, error, refetch } = useQueryWithRealtime<any[]>(() => adminService.queue(type) as any, queueTable, [type], "status=eq.PENDING");
  const { showToast } = useApp();
  const [done, setDone] = useState<string[]>([]);
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [addingPlace, setAddingPlace] = useState(false);

  const tabs: [QueueType, string][] = [["business", "Shops"], ["provider", "Providers"], ["place", "Places"], ["category", "Categories"]];

  async function act(item: any, approve: boolean) {
    if (pendingIds.includes(item.id)) return;
    setPendingIds((prev) => [...prev, item.id]);
    try {
      if (approve) await adminService.approve(item.kind, item.id);
      else await adminService.reject(item.kind, item.id, "Did not meet guidelines");
      setDone((d) => [...d, item.id]);
      showToast(approve ? "Approved ✓" : "Rejected");
    } catch (err: any) {
      showToast(err?.message || "Action failed — try again");
    } finally {
      setPendingIds((prev) => prev.filter((id) => id !== item.id));
    }
  }

  return (
    <>
      <div className="row between center-v" style={{ paddingTop: 12 }}>
        <div className="hscroll grow" role="tablist" aria-label="Review queue categories">
          {tabs.map(([t, label]) => (
            <button
              key={t}
              role="tab"
              aria-selected={type === t}
              className={`chip ${type === t ? "active chip--selected" : ""}`}
              onClick={() => { setType(t); setDone([]); }}
            >
              {label}
            </button>
          ))}
        </div>
        {type === "place" && (
          <button className="btn btn-sm btn-outline" style={{ flexShrink: 0, marginLeft: 8 }} onClick={() => setAddingPlace(true)}>
            + Add place
          </button>
        )}
      </div>
      {addingPlace && (
        <div className="page-pad">
          <PlaceRequestForm
            mode="admin-create"
            embedded
            onDone={() => { setAddingPlace(false); refetch(); }}
            onClose={() => setAddingPlace(false)}
          />
        </div>
      )}
      {loading && <ListSkeleton count={3} />}
      {!loading && error && (
        <div className="page-pad">
          <ErrorView error={error} onRetry={refetch} />
        </div>
      )}
      {!loading && !error && data && (
        <div className="page-pad col gap-12">
          {data.filter((i) => !done.includes(i.id)).length === 0 && <EmptyState emoji="✅" title="Queue clear" text="Nothing pending review." />}
          {data.filter((i) => !done.includes(i.id)).map((item) => {
            const Icon = type === "business" ? Store : type === "provider" ? Briefcase : type === "place" ? Mountains : Tag;
            const isBusy = pendingIds.includes(item.id);
            return (
              <div key={item.id} className="card">
                <div className="row gap-12">
                  {item.image ? <img src={item.image} alt={item.name} className="thumb" style={{ width: 48, height: 48, borderRadius: 12 }} /> : <div style={{ width: 48, height: 48, borderRadius: 12, background: "var(--brand-50)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon size={20} color="var(--brand-600)" /></div>}
                  <div className="grow"><div className="semi small">{item.name}</div><div className="tiny muted">{item.sub}</div></div>
                </div>

                {/* The submitted details. Without these an admin was approving
                    a business from a name and a photo — unable to check the
                    address existed, the phone worked, or that it was even in a
                    city we serve. */}
                {item.details && (
                  <div className="col gap-6" style={{ marginTop: 12, padding: "10px 12px", background: "var(--ink-50)", borderRadius: 10 }}>
                    {Object.entries(item.details as Record<string, string | null>)
                      .filter(([, v]) => v)
                      .map(([label, value]) => (
                        <div key={label} className="row gap-8" style={{ alignItems: "flex-start" }}>
                          <span className="tiny muted" style={{ minWidth: 92, flexShrink: 0 }}>{label}</span>
                          <span className="tiny" style={{ color: "var(--ink-800)", wordBreak: "break-word" }}>{value}</span>
                        </div>
                      ))}
                    {Object.values(item.details as Record<string, string | null>).every((v) => !v) && (
                      <span className="tiny" style={{ color: "var(--red-600)" }}>
                        No details submitted — reject and ask them to complete their profile.
                      </span>
                    )}
                  </div>
                )}

                <div className="row gap-8" style={{ marginTop: 12 }}>
                  <button
                    className="btn btn-outline grow btn-sm"
                    disabled={isBusy}
                    onClick={() => act(item, false)}
                  >
                    <X size={15} /> {isBusy ? "Rejecting..." : "Reject"}
                  </button>
                  <button
                    className="btn btn-green grow btn-sm"
                    disabled={isBusy}
                    onClick={() => act(item, true)}
                  >
                    <Check size={15} /> {isBusy ? "Approving..." : "Approve"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// Manual STRYT Verified review queue. Approve/reject/suspend all go through
// adminService.reviewVerification -> the verification-review Edge Function —
// no code path here can grant the badge directly; a DB trigger blocks any
// write that isn't from that service, so this UI only ever *requests* a
// decision, it never makes one client-side.
