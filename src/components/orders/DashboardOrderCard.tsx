import {
  Check,
  CheckCircle2,
  Navigation,
  Package,
  Wallet,
  X as XIcon,
  Zap,
} from "@/components/Icons";
import { SafeImg } from "@/components/common";
import DeliveryAssignControl from "@/components/delivery/DeliveryAssignControl";
import { inr } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { resolveOrderStage } from "@/lib/dashboardOrders";
import { customOrderNote } from "@/lib/orderLines";
import { enrichOrderLinesWithStock } from "@/lib/orderStockEnrichment";
import { DELIVERY_AGENT_ENABLED } from "@/lib/features";
import { ownerVisibleCustomerName } from "@/services/engagement/appointmentService";
import type { AppointmentDelivery } from "@/services/engagement/deliveryService";
import type { AppointmentRecord, CatalogItem } from "@/types";

export interface DashboardOrderCardProps {
  item: AppointmentRecord;
  businessId: string;
  catalog?: CatalogItem[];
  currentUserId?: string;
  preloadedDelivery?: AppointmentDelivery | null;
  busy: boolean;
  packing: boolean;
  onAccept: (item: AppointmentRecord) => void;
  onAcceptAndPack: (item: AppointmentRecord) => void;
  onAcceptWithPayment: (item: AppointmentRecord) => void;
  onDecline: (item: AppointmentRecord) => void;
  onMarkPacked: (aptId: string) => void;
  onCompletePickup: (item: AppointmentRecord) => void;
  onPaymentDecision: (item: AppointmentRecord, accept: boolean) => void;
  onOpenLiveBoard: () => void;
  onOpenSelfRun: () => void;
  onOpenDetails: () => void;
  onDeliveryChanged: () => void;
}

const STAGE_STYLE: Record<
  ReturnType<typeof resolveOrderStage>["stage"],
  { badgeClass: string; borderVar: string; labelKey: string; hintKey: string }
> = {
  NEW: {
    badgeClass: "badge-amber",
    borderVar: "var(--amber-500)",
    labelKey: "mdash_stage_new",
    hintKey: "mdash_hint_new",
  },
  PACK: {
    badgeClass: "badge-purple",
    borderVar: "var(--brand-500)",
    labelKey: "mdash_stage_pack",
    hintKey: "mdash_hint_pack",
  },
  ASSIGN_RIDER: {
    badgeClass: "badge-green",
    borderVar: "var(--green-500)",
    labelKey: "mdash_stage_assign",
    hintKey: "mdash_hint_assign",
  },
  OUT_FOR_DELIVERY: {
    badgeClass: "badge-green",
    borderVar: "var(--green-600)",
    labelKey: "mdash_stage_delivery",
    hintKey: "mdash_hint_delivery",
  },
  READY_PICKUP: {
    badgeClass: "badge-green",
    borderVar: "var(--green-500)",
    labelKey: "mdash_stage_ready",
    hintKey: "mdash_hint_pickup",
  },
};

export default function DashboardOrderCard({
  item,
  businessId,
  catalog,
  currentUserId,
  preloadedDelivery,
  busy,
  packing,
  onAccept,
  onAcceptAndPack,
  onAcceptWithPayment,
  onDecline,
  onMarkPacked,
  onCompletePickup,
  onPaymentDecision,
  onOpenLiveBoard,
  onOpenSelfRun,
  onOpenDetails,
  onDeliveryChanged,
}: DashboardOrderCardProps) {
  const { t, tf } = useI18n();
  const isDelivery = item.fulfillmentType === "DELIVERY";
  const { stage, isSelfRider } = resolveOrderStage(item, preloadedDelivery, currentUserId);
  const meta = STAGE_STYLE[stage];

  const enrichedLines = enrichOrderLinesWithStock(item.items, catalog);
  const note = customOrderNote(item.notes, item.items);
  const hasClaim = item.paymentStatus === "PENDING_CONFIRM";
  const claimAmt = inr(item.paymentAmount ?? item.packagePrice ?? 0);

  return (
    <div className="card col gap-10" style={{ padding: 14, borderLeft: `3px solid ${meta.borderVar}` }}>
      {/* Header: customer + delivery/pickup + current pipeline stage */}
      <div className="row between center-v gap-8">
        <div className="row gap-8 center-v" style={{ minWidth: 0 }}>
          <SafeImg src={item.customerAvatar} variant="avatar" style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div className="small semi ellipsis">{ownerVisibleCustomerName(item)}</div>
            <div className="tiny muted ellipsis">
              {isDelivery ? t("mdash_mode_delivery") : t("mdash_mode_pickup")} · {item.timeLabel}
            </div>
          </div>
        </div>
        <span className={`badge ${meta.badgeClass}`} style={{ fontSize: 10, flexShrink: 0 }}>
          {t(meta.labelKey)}
        </span>
      </div>

      {/* Items + stock health + address + genuine customer note only */}
      {(enrichedLines.length > 0 || item.deliveryAddressLine || note) && (
        <div className="col gap-6" style={{ background: "var(--ink-50)", padding: "8px 10px", borderRadius: 10 }}>
          {enrichedLines.length > 0 && (
            <div className="col gap-4">
              {enrichedLines.map((line, idx) => (
                <div key={`${line.catalogItemId}-${idx}`} className="row between center-v tiny">
                  <span className="semi" style={{ color: "var(--ink-800)", minWidth: 0, overflowWrap: "anywhere" }}>
                    <span style={{ color: "var(--brand-700)", fontWeight: 700 }}>{line.quantity}×</span> {line.name}
                  </span>
                  {item.status === "PENDING" ? (
                    <span style={{ fontSize: 10, flexShrink: 0 }}>
                      {line.stockHealth === "OUT_OF_STOCK" && <span style={{ color: "var(--red-600)", fontWeight: 700 }}>{t("mdash_stock_out")}</span>}
                      {line.stockHealth === "SHORTAGE" && <span style={{ color: "var(--red-600)", fontWeight: 700 }}>{tf("mdash_stock_shortage", { n: line.availableQuantity ?? 0 })}</span>}
                      {line.stockHealth === "LOW_STOCK" && <span style={{ color: "var(--amber-800)", fontWeight: 600 }}>{tf("mdash_stock_low", { n: line.availableQuantity ?? 0 })}</span>}
                      {line.stockHealth === "IN_STOCK" && line.availableQuantity != null && <span style={{ color: "var(--green-700)", fontWeight: 600 }}>{tf("mdash_stock_count", { n: line.availableQuantity })}</span>}
                      {line.stockHealth === "IN_STOCK" && line.availableQuantity == null && <span style={{ color: "var(--green-700)", fontWeight: 600 }}>{t("mdash_stock_in")}</span>}
                    </span>
                  ) : (
                    line.price != null && (
                      <span className="muted tabular-nums" style={{ flexShrink: 0 }}>{inr(line.price * line.quantity)}</span>
                    )
                  )}
                </div>
              ))}
            </div>
          )}
          {item.deliveryAddressLine && (
            <div className="tiny" style={{ color: "var(--ink-600)" }}>
              📍 {item.deliveryAddressLine}
            </div>
          )}
          {note && (
            <div className="tiny" style={{ color: "var(--ink-600)", fontStyle: "italic" }}>
              📝 {note}
            </div>
          )}
        </div>
      )}

      {/* Unified payment status / inline verification (never split into a separate top card) */}
      {hasClaim && (
        <div
          className="col gap-8"
          style={{
            background: "var(--amber-50)",
            border: "1px solid var(--amber-100)",
            borderRadius: 10,
            padding: "8px 10px",
          }}
        >
          <div className="row gap-6 center-v">
            <Wallet size={15} color="var(--amber-700)" />
            <div className="grow tiny semi" style={{ color: "var(--amber-800)" }}>
              {tf("mdash_claims_amount", { amount: claimAmt })}
              {item.paymentMethod ? ` · ${item.paymentMethod}` : ""}
              {item.paymentReference ? ` (${item.paymentReference})` : ""}
            </div>
          </div>
          {item.status === "ACCEPTED" && (
            <div className="row gap-8">
              <button
                type="button"
                className="btn btn-green btn-sm grow"
                disabled={busy}
                onClick={() => onPaymentDecision(item, true)}
              >
                {t("confirm")}
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm grow"
                disabled={busy}
                onClick={() => onPaymentDecision(item, false)}
              >
                {t("mdash_reject")}
              </button>
            </div>
          )}
        </div>
      )}

      {item.paymentStatus === "PAID" && (
        <div className="row gap-6 center-v tiny semi" style={{ color: "var(--green-700)" }}>
          <CheckCircle2 size={14} color="var(--green-600)" />
          <span>{tf("mdash_payment_confirmed", { amount: claimAmt })}</span>
        </div>
      )}

      {/* Next-step guide */}
      <div className="tiny muted">
        {isSelfRider ? t("mdash_hint_self_rider") : t(meta.hintKey)}
      </div>

      {/* Stage action controls */}
      {stage === "NEW" && (
        <div className="row wrap gap-8">
          {hasClaim ? (
            <>
              <button
                type="button"
                className="btn btn-green btn-sm grow row gap-4 center"
                disabled={busy}
                onClick={() => onAcceptWithPayment(item)}
              >
                <Check size={14} /> {tf("mdash_accept_and_confirm", { amount: claimAmt })}
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm row gap-4 center"
                disabled={busy}
                onClick={() => onAccept(item)}
              >
                {t("notif_apt_accept")}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-green btn-sm grow row gap-4 center"
              disabled={busy}
              onClick={() => onAccept(item)}
            >
              <Check size={14} /> {t("notif_apt_accept")}
            </button>
          )}
          {isDelivery && !hasClaim && (
            <button
              type="button"
              className="btn btn-delivery btn-sm grow row gap-4 center"
              disabled={busy}
              onClick={() => onAcceptAndPack(item)}
            >
              <Zap size={14} /> {t("mdash_accept_pack")}
            </button>
          )}
          <button
            type="button"
            className="btn btn-outline btn-sm row gap-4 center"
            disabled={busy}
            onClick={() => onDecline(item)}
          >
            <XIcon size={14} /> {t("notif_apt_decline")}
          </button>
        </div>
      )}

      {stage === "PACK" && (
        <div className="row gap-8 center-v">
          <button
            type="button"
            className="btn btn-green btn-sm grow row gap-6 center"
            disabled={packing}
            onClick={() => onMarkPacked(item.id)}
          >
            <Package size={15} /> {t("dlv_mark_packed")}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onOpenDetails}>
            {t("mdash_details")}
          </button>
        </div>
      )}

      {stage === "READY_PICKUP" && (
        <div className="row gap-8 center-v">
          <button
            type="button"
            className="btn btn-green btn-sm grow row gap-6 center"
            disabled={busy}
            onClick={() => onCompletePickup(item)}
          >
            <CheckCircle2 size={15} /> {t("mdash_complete_handover")}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onOpenDetails}>
            {t("mdash_details")}
          </button>
        </div>
      )}

      {(stage === "ASSIGN_RIDER" || stage === "OUT_FOR_DELIVERY") && (
        <>
          {DELIVERY_AGENT_ENABLED && (
            <DeliveryAssignControl
              appointmentId={item.id}
              businessId={businessId}
              preloaded={preloadedDelivery}
              packed={!!item.readyAt}
              onChanged={onDeliveryChanged}
            />
          )}
          <div className="row gap-8 center-v">
            {isSelfRider ? (
              <button
                type="button"
                className="btn btn-delivery btn-sm grow row gap-6 center"
                onClick={onOpenSelfRun}
              >
                <Package size={14} /> {t("mdash_open_my_run")}
              </button>
            ) : stage === "OUT_FOR_DELIVERY" ? (
              <button
                type="button"
                className="btn btn-outline btn-sm grow row gap-6 center"
                onClick={onOpenLiveBoard}
              >
                <Navigation size={14} /> {t("mdash_live_board")}
              </button>
            ) : null}
            <button type="button" className="btn btn-ghost btn-sm" onClick={onOpenDetails}>
              {t("mdash_details")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
