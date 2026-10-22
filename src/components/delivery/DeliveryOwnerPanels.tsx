import { useState } from "react";
import { useQuery, invalidateQueryCache } from "@/hooks/useApi";
import { deliveryService } from "@/services";
import { useApp } from "@/store";
import { useI18n } from "@/lib/i18n";
import { inr } from "@/lib/format";
import { errorMessage } from "@/lib/errorMessage";
import { Package, Wallet } from "@/components/Icons";

/**
 * What the shop owner needs above the delivery list: how many orders are waiting for a rider, the cash riders are holding,
 * and a 30-day summary. Every query degrades to "nothing to show" on failure, so a database that hasn't had migration
 * 20261001 yet leaves the existing list exactly as it was.
 */
export default function DeliveryOwnerPanels({ businessId, awaitingCount }: { businessId: string; awaitingCount: number }) {
  const { t, tf } = useI18n();
  const { showToast } = useApp();
  const [settling, setSettling] = useState<string | null>(null);
  const [collecting, setCollecting] = useState<string | null>(null);

  const cashKey = `delivery:cash:${businessId}`;
  const { data: cash, refetch: refetchCash } = useQuery(
    () => deliveryService.cashToSettle(businessId).catch(() => []),
    [businessId],
    cashKey,
  );
  // Delivered but never paid: the rider handed over the goods without the money (or the customer said they'd pay later).
  const outstandingKey = `delivery:outstanding:${businessId}`;
  const { data: outstanding, refetch: refetchOutstanding } = useQuery(
    () => deliveryService.cashOutstanding(businessId).catch(() => []),
    [businessId],
    outstandingKey,
  );
  const { data: stats } = useQuery(
    () => deliveryService.stats(businessId, 30).catch(() => null),
    [businessId],
    `delivery:stats:${businessId}`,
  );

  async function settle(agentUserId: string) {
    if (settling) return;
    setSettling(agentUserId);
    try {
      const amount = await deliveryService.settleCash(businessId, agentUserId);
      showToast(tf("dlv_cash_settled_toast", { n: Math.round(amount) }));
      invalidateQueryCache(cashKey);
      refetchCash();
    } catch (e) {
      showToast(errorMessage(e, "Couldn't update — try again"));
    } finally {
      setSettling(null);
    }
  }

  async function markPaid(appointmentId: string) {
    if (collecting) return;
    setCollecting(appointmentId);
    try {
      await deliveryService.markOutstandingPaid(appointmentId);
      showToast(t("dlv_outstanding_paid_toast"));
      invalidateQueryCache(outstandingKey);
      refetchOutstanding();
    } catch (e) {
      showToast(errorMessage(e, "Couldn't update — try again"));
    } finally {
      setCollecting(null);
    }
  }

  const hasStats = !!stats && stats.delivered + stats.cancelled > 0;

  return (
    <div className="col gap-12">
      {awaitingCount > 0 && (
        <div
          className="row gap-10 center-v"
          style={{ background: "var(--delivery-50)", border: "1px solid var(--delivery-100, var(--ink-200))", borderRadius: 14, padding: "11px 14px" }}
        >
          <Package size={18} color="var(--delivery-600)" />
          <span className="semi small" style={{ color: "var(--delivery-600)" }}>{tf("dlv_awaiting_count", { n: awaitingCount })}</span>
        </div>
      )}

      {(outstanding ?? []).length > 0 && (
        <div className="card col gap-10" style={{ padding: 14, border: "1px solid var(--red-100)" }}>
          <div className="row gap-8 center-v">
            <Wallet size={16} color="var(--red-600)" />
            <span className="semi small">{t("dlv_outstanding_title")}</span>
          </div>
          <div className="tiny muted">{t("dlv_outstanding_hint")}</div>
          {(outstanding ?? []).map((o) => (
            <div key={o.appointmentId} className="row between center-v">
              <div style={{ minWidth: 0 }}>
                <div className="semi small ellipsis">{o.customerName}</div>
                <div className="tiny muted ellipsis">{o.agentName}</div>
              </div>
              <div className="row gap-10 center-v">
                <span className="bold" style={{ color: "var(--red-700)" }}>{inr(o.amount)}</span>
                <button className="btn btn-outline btn-sm" disabled={collecting === o.appointmentId} onClick={() => markPaid(o.appointmentId)}>
                  {t("dlv_cash_settle")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {(cash ?? []).length > 0 && (
        <div className="card col gap-10" style={{ padding: 14 }}>
          <div className="row gap-8 center-v">
            <Wallet size={16} color="var(--amber-600)" />
            <span className="semi small">{t("dlv_cash_title")}</span>
          </div>
          {(cash ?? []).map((c) => (
            <div key={c.agentUserId} className="row between center-v">
              <div>
                <div className="semi small">{c.agentName}</div>
                <div className="tiny muted">{tf("dlv_cash_row", { n: c.orders })}</div>
              </div>
              <div className="row gap-10 center-v">
                <span className="bold" style={{ color: "var(--amber-700)" }}>{inr(c.amount)}</span>
                <button className="btn btn-outline btn-sm" disabled={settling === c.agentUserId} onClick={() => settle(c.agentUserId)}>
                  {t("dlv_cash_settle")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {hasStats && stats && (
        <div className="card col gap-12" style={{ padding: 14 }}>
          <div className="row between center-v">
            <span className="semi small">{t("dlv_stats_title")}</span>
            <span className="tiny muted">{tf("dlv_stats_period", { n: stats.days })}</span>
          </div>
          <div className="row" style={{ gap: 0 }}>
            <Stat label={t("dlv_stat_delivered")} value={String(stats.delivered)} color="var(--green-600)" />
            <Stat label={t("dlv_stat_avg")} value={stats.avgMinutes == null ? "—" : tf("dlv_stat_min", { n: stats.avgMinutes })} />
            <Stat label={t("dlv_stat_cancelled")} value={String(stats.cancelled)} color={stats.cancelled > 0 ? "var(--red-600)" : undefined} />
            <Stat label={t("dlv_stat_fees")} value={inr(stats.feesCollected)} />
          </div>
          {stats.perAgent.length > 0 && (
            <div className="col gap-6" style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
              <span className="tiny semi muted">{t("dlv_stat_per_rider")}</span>
              {stats.perAgent.map((a) => (
                <div key={a.agentUserId} className="row between small">
                  <span>{a.name}</span>
                  <span className="semi">{a.delivered}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="col center" style={{ flex: "1 1 0", minWidth: 0, gap: 2, textAlign: "center" }}>
      <span className="bold" style={{ fontSize: 16, color }}>{value}</span>
      <span className="tiny muted">{label}</span>
    </div>
  );
}
