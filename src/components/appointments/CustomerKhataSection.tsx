import { useMemo, useState } from "react";
import { CheckCircle2, Phone, Search, ChevronDown, ChevronUp, Clock, IndianRupee, X } from "@/components/Icons";
import { inr, SafeImg } from "@/components/common";
import { appointmentService, groupCustomerTabs, type CustomerTabGroup } from "@/services/engagement/appointmentService";
import type { AppointmentRecord, PaymentMethod } from "@/types";
import { useApp } from "@/store";
import { haptics } from "@/lib/haptics";

interface CustomerKhataSectionProps {
  appointments: AppointmentRecord[];
  onRefresh: () => void;
  title?: string;
}

export function CustomerKhataSection({
  appointments,
  onRefresh,
  title = "Customer Khata (Unpaid Tabs)",
}: CustomerKhataSectionProps) {
  const { showToast } = useApp();
  const [query, setQuery] = useState("");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [settlingGroup, setSettlingGroup] = useState<CustomerTabGroup | null>(null);
  const [settlingIndividualApt, setSettlingIndividualApt] = useState<AppointmentRecord | null>(null);
  const [settleMethod, setSettleMethod] = useState<PaymentMethod>("CASH");
  const [busy, setBusy] = useState(false);

  const groups = useMemo(() => groupCustomerTabs(appointments), [appointments]);

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(
      (g) =>
        g.customerName.toLowerCase().includes(q) ||
        (g.customerPhone && g.customerPhone.includes(q))
    );
  }, [groups, query]);

  const totalKhataBalance = useMemo(
    () => groups.reduce((sum, g) => sum + g.totalOwed, 0),
    [groups]
  );
  const totalVisitsCount = useMemo(
    () => groups.reduce((sum, g) => sum + g.visitCount, 0),
    [groups]
  );

  async function handleSettleFullTab() {
    if (!settlingGroup || busy) return;
    setBusy(true);
    try {
      const ids = settlingGroup.appointments.map((a) => a.id);
      await appointmentService.settleCustomerTab(ids, settleMethod);
      haptics.success();
      showToast(`✓ Settled ${inr(settlingGroup.totalOwed)} for ${settlingGroup.customerName}`);
      setSettlingGroup(null);
      onRefresh();
    } catch (e: any) {
      showToast(e?.message || "Couldn't settle tab. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSettleSingle() {
    if (!settlingIndividualApt || busy) return;
    setBusy(true);
    try {
      await appointmentService.recordWalkInPayment(settlingIndividualApt.id, settleMethod);
      haptics.success();
      showToast(`✓ Payment recorded for ${settlingIndividualApt.dateLabel}`);
      setSettlingIndividualApt(null);
      onRefresh();
    } catch (e: any) {
      showToast(e?.message || "Couldn't record payment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="col gap-12" style={{ marginTop: 8 }}>
      {/* Section Header */}
      <div className="row between center-v">
        <div className="row gap-8 center-v">
          <span style={{ fontSize: 18 }}>📒</span>
          <div>
            <div className="semi small">{title}</div>
            <div className="tiny muted">Track & settle outstanding customer credit</div>
          </div>
        </div>
        {groups.length > 0 && (
          <span className="badge badge-amber" style={{ fontSize: 12, fontWeight: 700 }}>
            {inr(totalKhataBalance)} total
          </span>
        )}
      </div>

      {/* Summary KPI chips */}
      {groups.length > 0 && (
        <div className="row gap-8">
          <div className="card grow col center" style={{ padding: "8px 10px", background: "var(--ink-50)" }}>
            <span className="tiny muted">Outstanding</span>
            <span className="bold small" style={{ color: "var(--amber-700)" }}>{inr(totalKhataBalance)}</span>
          </div>
          <div className="card grow col center" style={{ padding: "8px 10px", background: "var(--ink-50)" }}>
            <span className="tiny muted">Customers</span>
            <span className="bold small">{groups.length}</span>
          </div>
          <div className="card grow col center" style={{ padding: "8px 10px", background: "var(--ink-50)" }}>
            <span className="tiny muted">Visits</span>
            <span className="bold small">{totalVisitsCount}</span>
          </div>
        </div>
      )}

      {/* Customer Search Bar */}
      {groups.length > 0 && (
        <div style={{ position: "relative" }}>
          <Search size={15} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--ink-400)" }} />
          <input
            className="input"
            style={{ paddingLeft: 32, fontSize: 13, height: 38 }}
            placeholder="Search customer by name or mobile number…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              type="button"
              className="icon-btn"
              style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", padding: 4 }}
              onClick={() => setQuery("")}
            >
              <X size={13} />
            </button>
          )}
        </div>
      )}

      {/* Empty State */}
      {groups.length === 0 ? (
        <div className="card col center" style={{ padding: 24, gap: 6, background: "var(--surface)" }}>
          <Clock size={24} color="var(--ink-400)" />
          <div className="semi small">No unpaid customer tabs</div>
          <div className="tiny muted" style={{ textAlign: "center", maxWidth: 280 }}>
            When clients defer payment or maintain an ongoing monthly tab, they will be organized here.
          </div>
        </div>
      ) : filteredGroups.length === 0 ? (
        <div className="card col center" style={{ padding: 20, gap: 4 }}>
          <span className="tiny muted">No customer matching "{query}"</span>
        </div>
      ) : (
        <div className="col gap-10">
          {filteredGroups.map((group) => {
            const isExpanded = expandedKey === group.key;
            return (
              <div
                key={group.key}
                className="card col gap-10"
                style={{
                  padding: 14,
                  background: "var(--surface)",
                  border: "1px solid var(--ink-200)",
                  borderRadius: 12,
                }}
              >
                {/* Header row */}
                <div className="row between center-v">
                  <div className="row gap-10 center-v grow">
                    <SafeImg src={group.customerAvatar ?? undefined} variant="avatar" style={{ width: 38, height: 38 }} />
                    <div className="grow">
                      <div className="bold small">{group.customerName}</div>
                      <div className="row gap-8 center-v" style={{ marginTop: 2 }}>
                        {group.customerPhone && (
                          <a
                            href={`tel:${group.customerPhone}`}
                            className="row gap-4 center-v tiny"
                            style={{ color: "var(--brand-700)", fontWeight: 600, textDecoration: "none" }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Phone size={11} /> {group.customerPhone}
                          </a>
                        )}
                        <span className="tiny muted">• {group.visitCount} visit{group.visitCount > 1 ? "s" : ""} on tab</span>
                      </div>
                    </div>
                  </div>

                  <div className="col gap-4" style={{ alignItems: "flex-end" }}>
                    <span className="badge badge-amber" style={{ fontSize: 13, fontWeight: 700 }}>
                      {inr(group.totalOwed)}
                    </span>
                    <button
                      type="button"
                      className="btn btn-green btn-sm"
                      style={{ fontSize: 11, padding: "3px 10px", fontWeight: 700 }}
                      onClick={() => setSettlingGroup(group)}
                    >
                      Settle Tab
                    </button>
                  </div>
                </div>

                {/* Expand / Collapse toggle */}
                <button
                  type="button"
                  className="row between center-v tiny semi"
                  style={{
                    padding: "6px 8px",
                    background: "var(--ink-50)",
                    borderRadius: 8,
                    color: "var(--ink-700)",
                    cursor: "pointer",
                    border: "none",
                  }}
                  onClick={() => setExpandedKey(isExpanded ? null : group.key)}
                >
                  <span>{isExpanded ? "Hide visit breakdown" : `View ${group.visitCount} unpaid visit${group.visitCount > 1 ? "s" : ""}`}</span>
                  {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>

                {/* Expanded visits list */}
                {isExpanded && (
                  <div className="col gap-6" style={{ paddingLeft: 6, borderLeft: "2px solid var(--amber-200)", marginTop: 2 }}>
                    {group.appointments.map((apt) => (
                      <div key={apt.id} className="row between center-v" style={{ padding: "6px 0" }}>
                        <div>
                          <div className="tiny semi">{apt.packageName || "Service booking"}</div>
                          <div className="tiny muted">{apt.dateLabel} at {apt.timeLabel}</div>
                        </div>
                        <div className="row gap-8 center-v">
                          <span className="tiny bold" style={{ color: "var(--amber-700)" }}>
                            {inr(apt.packagePrice ?? apt.paymentAmount ?? 0)}
                          </span>
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            style={{ fontSize: 10, padding: "2px 6px" }}
                            onClick={() => setSettlingIndividualApt(apt)}
                          >
                            Mark Paid
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Full Tab Settlement Sheet Modal */}
      {settlingGroup && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1300,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={() => !busy && setSettlingGroup(null)}
        >
          <div
            className="card col gap-14"
            style={{ width: "100%", maxWidth: 400, padding: 20, background: "var(--surface)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="row between center-v">
              <div className="bold" style={{ fontSize: 16 }}>Settle Customer Tab</div>
              <button className="icon-btn" onClick={() => setSettlingGroup(null)} disabled={busy}><X size={18} /></button>
            </div>

            <div className="card col gap-6" style={{ background: "var(--ink-50)", padding: 12, borderRadius: 10 }}>
              <div className="semi small">{settlingGroup.customerName}</div>
              <div className="tiny muted">{settlingGroup.visitCount} visit(s) being concluded</div>
              <div className="row between center-v" style={{ marginTop: 4 }}>
                <span className="tiny semi muted">Total balance to collect:</span>
                <span className="bold h3" style={{ color: "var(--green-600)" }}>{inr(settlingGroup.totalOwed)}</span>
              </div>
            </div>

            <div>
              <label className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>Payment received via</label>
              <div className="row gap-8">
                <button
                  type="button"
                  className="grow row gap-6 center"
                  onClick={() => setSettleMethod("CASH")}
                  style={{
                    padding: "10px 0",
                    borderRadius: 10,
                    border: settleMethod === "CASH" ? "2px solid var(--green-500)" : "1px solid var(--ink-200)",
                    background: settleMethod === "CASH" ? "var(--green-100)" : "var(--surface)",
                    color: settleMethod === "CASH" ? "var(--green-600)" : "var(--ink-700)",
                    fontWeight: 700,
                    fontSize: 13,
                  }}
                >
                  <CheckCircle2 size={15} /> Cash
                </button>
                <button
                  type="button"
                  className="grow row gap-6 center"
                  onClick={() => setSettleMethod("UPI")}
                  style={{
                    padding: "10px 0",
                    borderRadius: 10,
                    border: settleMethod === "UPI" ? "2px solid var(--brand-600)" : "1px solid var(--ink-200)",
                    background: settleMethod === "UPI" ? "var(--brand-50)" : "var(--surface)",
                    color: settleMethod === "UPI" ? "var(--brand-700)" : "var(--ink-700)",
                    fontWeight: 700,
                    fontSize: 13,
                  }}
                >
                  <IndianRupee size={15} /> UPI / QR
                </button>
              </div>
            </div>

            <div className="row gap-8 end" style={{ marginTop: 8 }}>
              <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setSettlingGroup(null)}>Cancel</button>
              <button
                type="button"
                className="btn btn-green btn-sm row gap-6 center"
                disabled={busy}
                onClick={handleSettleFullTab}
              >
                <CheckCircle2 size={14} />
                {busy ? "Settling tab…" : `Confirm ${inr(settlingGroup.totalOwed)} Received`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Individual Visit Settle Sheet Modal */}
      {settlingIndividualApt && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1300,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={() => !busy && setSettlingIndividualApt(null)}
        >
          <div
            className="card col gap-14"
            style={{ width: "100%", maxWidth: 380, padding: 20, background: "var(--surface)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="row between center-v">
              <div className="bold" style={{ fontSize: 16 }}>Mark Visit Paid</div>
              <button className="icon-btn" onClick={() => setSettlingIndividualApt(null)} disabled={busy}><X size={18} /></button>
            </div>

            <div className="tiny muted">
              {settlingIndividualApt.dateLabel} • {settlingIndividualApt.packageName || "Service booking"}
            </div>

            <div className="row between center-v" style={{ padding: "8px 12px", background: "var(--ink-50)", borderRadius: 8 }}>
              <span className="tiny semi">Amount to collect:</span>
              <span className="bold small" style={{ color: "var(--green-600)" }}>
                {inr(settlingIndividualApt.packagePrice ?? settlingIndividualApt.paymentAmount ?? 0)}
              </span>
            </div>

            <div>
              <label className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>Payment method</label>
              <div className="row gap-8">
                {(["CASH", "UPI"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    className="grow"
                    onClick={() => setSettleMethod(m)}
                    style={{
                      padding: "8px 0",
                      borderRadius: 8,
                      border: settleMethod === m ? "2px solid var(--green-500)" : "1px solid var(--ink-200)",
                      background: settleMethod === m ? "var(--green-100)" : "var(--surface)",
                      color: settleMethod === m ? "var(--green-600)" : "var(--ink-700)",
                      fontWeight: 700,
                      fontSize: 12,
                    }}
                  >
                    {m === "CASH" ? "Cash" : "UPI"}
                  </button>
                ))}
              </div>
            </div>

            <div className="row gap-8 end">
              <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setSettlingIndividualApt(null)}>Cancel</button>
              <button
                type="button"
                className="btn btn-green btn-sm"
                disabled={busy}
                onClick={handleSettleSingle}
              >
                {busy ? "Recording…" : "Confirm Paid"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
