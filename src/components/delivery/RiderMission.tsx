import { Navigation, Phone } from "@/components/Icons";
import { useI18n } from "@/lib/i18n";
import { MISSION_STEPS, riderMission } from "@/lib/riderMission";
import type { DeliveryItem } from "@/services/engagement/deliveryService";

/**
 * The rider's "what do I do now" block: a headline for the single next thing, one line under it, and four named steps with a tick
 * on each one done. It replaces unlabelled dots, so a rider can glance at the phone at a red light and know where they are.
 */
export function RiderMission({ d, stopLabel }: { d: DeliveryItem; stopLabel?: string }) {
  const { t, tf } = useI18n();
  const m = riderMission(d);
  const vars = {
    shop: d.businessName,
    name: d.customerName,
    n: Math.round(d.amountDue),
    items: d.items.reduce((sum, i) => sum + i.quantity, 0),
  };
  return (
    <div className={`rm${m.waiting ? " waiting" : ""}${m.step >= MISSION_STEPS.length ? " done" : ""}`}>
      <div className="rm-head">
        <span className="rm-emoji" aria-hidden="true">{m.emoji}</span>
        <div style={{ minWidth: 0 }}>
          {stopLabel && <div className="rm-stop">{stopLabel}</div>}
          <div className="rm-title">{tf(m.headlineKey, vars)}</div>
          <div className="rm-sub">{tf(m.subKey, vars)}</div>
        </div>
      </div>
      <div className="rm-steps" role="list">
        {MISSION_STEPS.map((s, i) => {
          const done = i < m.step;
          const now = i === m.step;
          return (
            <div key={s} role="listitem" className={`rm-step${done ? " done" : ""}${now ? " now" : ""}`}>
              <span className="rm-dot" aria-hidden="true">{done ? "✓" : i + 1}</span>
              <span>{t(`dlv_ms_${s}`)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Where the rider is going right now — the shop until the order is picked up, then the customer — with the full address (it wraps, it
 * is never cut off) and one-tap navigate and call. The customer's number only exists once the rider is on the way to them.
 */
export function RiderWhere({ d, onNavigate }: { d: DeliveryItem; onNavigate: (lat: number, lng: number) => void }) {
  const { t } = useI18n();
  if (d.status === "DELIVERED" || d.status === "CANCELLED") return null;
  const toShop = d.status === "ASSIGNED" && !d.pickedUpAt;
  const name = toShop ? d.businessName : d.customerName;
  const address = toShop ? d.businessAddress : d.deliveryAddressLine || d.customerArea || t("dlv_c_no_address");
  const phone = toShop ? d.businessPhone : d.customerPhone;
  const lat = toShop ? d.businessLat : d.deliveryLat;
  const lng = toShop ? d.businessLng : d.deliveryLng;
  return (
    <div className="rw">
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="tiny semi muted">{toShop ? t("dlv_w_pickup_from") : t("dlv_w_deliver_to")}</div>
        <div className="small semi">{name}</div>
        {address && <div className="rw-addr">{address}</div>}
      </div>
      <div className="rw-btns">
        {lat != null && lng != null && (
          <button type="button" className="trk-round" aria-label={t("dlv_c_navigate")} onClick={() => onNavigate(lat, lng)}>
            <Navigation size={18} />
          </button>
        )}
        {phone && (
          <a className="trk-round ghost" href={`tel:${phone}`} aria-label={toShop ? t("dlv_call_shop") : t("dlv_call_customer")}>
            <Phone size={18} />
          </a>
        )}
      </div>
    </div>
  );
}
