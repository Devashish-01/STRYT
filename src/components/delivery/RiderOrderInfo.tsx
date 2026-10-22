import { Phone } from "@/components/Icons";
import { useI18n } from "@/lib/i18n";
import type { DeliveryItem } from "@/services/engagement/deliveryService";

/**
 * What a rider needs at hand besides an address: who to call, what is in the bag, and what the customer asked for.
 * Shown on every live stop. The customer's number only exists once the rider is on the way to them (the database
 * withholds it earlier), so before that only the shop's number appears.
 */
export default function RiderOrderInfo({ d }: { d: DeliveryItem }) {
  const { t } = useI18n();
  const hasContact = !!d.customerPhone || !!d.businessPhone;
  const hasDetails = d.items.length > 0 || !!d.orderNotes || !!d.requestedWindow;
  if (!hasContact && !hasDetails) return null;

  return (
    <div className="col gap-8">
      {hasContact && (
        <div className="row gap-8">
          {d.customerPhone && (
            <a className="btn btn-delivery btn-sm grow row gap-6 center" href={`tel:${d.customerPhone}`}>
              <Phone size={14} /> {t("dlv_call_customer")}
            </a>
          )}
          {d.businessPhone && (
            <a className="btn btn-outline btn-sm grow row gap-6 center" href={`tel:${d.businessPhone}`}>
              <Phone size={14} /> {t("dlv_call_shop")}
            </a>
          )}
        </div>
      )}

      {hasDetails && (
        <div className="col gap-6" style={{ padding: "8px 10px", background: "var(--ink-50)", borderRadius: 10 }}>
          {d.items.length > 0 && (
            <div className="col gap-2">
              <span className="tiny semi muted">{t("dlv_order_items_title")}</span>
              {d.items.map((i, idx) => (
                <span key={`${i.name}-${idx}`} className="small">
                  <span className="semi">{i.quantity} ×</span> {i.name}
                </span>
              ))}
            </div>
          )}
          {d.requestedWindow && (
            <div className="small">
              <span className="tiny semi muted">{t("dlv_window_label")}: </span>
              {d.requestedWindow}
            </div>
          )}
          {d.orderNotes && (
            <div className="small" style={{ lineHeight: 1.4 }}>
              <span className="tiny semi muted">{t("dlv_note_label")}: </span>
              {d.orderNotes}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
