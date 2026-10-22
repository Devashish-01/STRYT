import { useEffect, useMemo, useState } from "react";
import { businessService } from "@/services";
import { useApp } from "@/store";
import { useI18n } from "@/lib/i18n";
import { haptics } from "@/lib/haptics";
import { errorMessage } from "@/lib/errorMessage";
import type { Business } from "@/types";

/** Delivery radius presets. null = follow the shop's own reach (broadcast radius). */
const RADIUS_PRESETS: (number | null)[] = [null, 1, 2, 3, 5, 8, 10, 15];

const toInt = (v: string): number | null => {
  const t = v.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isInteger(n) && n >= 0 ? n : NaN;
};

/**
 * Owner-facing editor for a shop's delivery terms: radius, flat fee, free-above amount, minimum order and prep time.
 * Saves through businessService.update (columns added in migration 20261001); the order sheet and appointment_create
 * read the same values, so what the owner sets here is exactly what the customer is shown and charged.
 */
export default function DeliveryTermsEditor({ business, onSaved }: { business: Business; onSaved?: () => void }) {
  const { t, tf } = useI18n();
  const { showToast } = useApp();
  const [radius, setRadius] = useState<number | null>(business.deliveryRadiusKm ?? null);
  const [fee, setFee] = useState(String(business.deliveryFee ?? 0));
  const [freeAbove, setFreeAbove] = useState(business.freeDeliveryAbove != null ? String(business.freeDeliveryAbove) : "");
  const [minOrder, setMinOrder] = useState(String(business.minOrderAmount ?? 0));
  const [prep, setPrep] = useState(String(business.deliveryPrepMin ?? 20));
  const [proof, setProof] = useState(!!business.deliveryProofAllowed);
  const [saving, setSaving] = useState(false);

  // Re-sync when the business reloads after a save (or the owner switches shop).
  useEffect(() => {
    setRadius(business.deliveryRadiusKm ?? null);
    setFee(String(business.deliveryFee ?? 0));
    setFreeAbove(business.freeDeliveryAbove != null ? String(business.freeDeliveryAbove) : "");
    setMinOrder(String(business.minOrderAmount ?? 0));
    setPrep(String(business.deliveryPrepMin ?? 20));
    setProof(!!business.deliveryProofAllowed);
  }, [business.id, business.deliveryProofAllowed, business.deliveryRadiusKm, business.deliveryFee, business.freeDeliveryAbove, business.minOrderAmount, business.deliveryPrepMin]);

  const parsed = useMemo(() => {
    const f = toInt(fee), fa = toInt(freeAbove), mo = toInt(minOrder), pm = toInt(prep);
    const ok =
      f !== null && !Number.isNaN(f) && f <= 5000 &&
      !Number.isNaN(fa as number) &&
      mo !== null && !Number.isNaN(mo) && mo <= 100000 &&
      pm !== null && !Number.isNaN(pm) && pm <= 240;
    return { ok, f: f ?? 0, fa, mo: mo ?? 0, pm: pm ?? 20 };
  }, [fee, freeAbove, minOrder, prep]);

  const dirty =
    radius !== (business.deliveryRadiusKm ?? null) ||
    parsed.f !== (business.deliveryFee ?? 0) ||
    parsed.fa !== (business.freeDeliveryAbove ?? null) ||
    parsed.mo !== (business.minOrderAmount ?? 0) ||
    parsed.pm !== (business.deliveryPrepMin ?? 20) ||
    proof !== !!business.deliveryProofAllowed;

  const preview = parsed.ok
    ? [
        parsed.f === 0
          ? t("bset_dlv_preview_free")
          : parsed.fa != null
            ? tf("bset_dlv_preview", { fee: parsed.f, above: parsed.fa })
            : tf("bset_dlv_preview_always", { fee: parsed.f }),
        parsed.mo > 0 ? tf("bset_dlv_min_note", { min: parsed.mo }) : "",
      ].filter(Boolean).join(" ")
    : "";

  async function save() {
    if (!parsed.ok || saving) return;
    setSaving(true);
    try {
      await businessService.update(business.id, {
        deliveryRadiusKm: radius,
        deliveryFee: parsed.f,
        freeDeliveryAbove: parsed.fa,
        minOrderAmount: parsed.mo,
        deliveryPrepMin: parsed.pm,
        deliveryProofAllowed: proof,
      } as Partial<Business>);
      haptics.success?.();
      showToast(t("bset_dlv_saved"));
      onSaved?.();
    } catch (e) {
      showToast(errorMessage(e, t("cpd_save_failed")));
    } finally {
      setSaving(false);
    }
  }

  const money = (value: string, set: (v: string) => void, invalid: boolean) => (
    <div className="row gap-6 center-v" style={{ position: "relative" }}>
      <span className="muted" style={{ position: "absolute", left: 12, fontWeight: 700 }}>₹</span>
      <input
        className="input grow"
        inputMode="numeric"
        value={value}
        onChange={(e) => set(e.target.value.replace(/[^\d]/g, ""))}
        style={{ paddingLeft: 28, borderColor: invalid ? "var(--red-500)" : undefined }}
      />
    </div>
  );

  return (
    <div className="col gap-14" style={{ padding: "13px 14px", borderTop: "1px solid var(--line)" }}>
      <div className="semi small">{t("bset_dlv_terms")}</div>

      <div>
        <div className="tiny semi" style={{ marginBottom: 6 }}>{t("bset_dlv_radius")}</div>
        <div className="row wrap gap-8">
          {RADIUS_PRESETS.map((r) => (
            <button
              key={r ?? "follow"}
              type="button"
              className={`chip ${radius === r ? "active" : ""}`}
              onClick={() => { haptics.selection(); setRadius(r); }}
            >
              {r === null ? t("bset_dlv_radius_follow") : `${r} km`}
            </button>
          ))}
        </div>
        <div className="tiny muted" style={{ marginTop: 6, lineHeight: 1.45 }}>{t("bset_dlv_radius_hint")}</div>
      </div>

      <div className="row gap-10">
        <div className="grow">
          <div className="tiny semi" style={{ marginBottom: 4 }}>{t("bset_dlv_fee")}</div>
          {money(fee, setFee, !parsed.ok && (toInt(fee) === null || Number.isNaN(toInt(fee) as number) || (toInt(fee) as number) > 5000))}
        </div>
        <div className="grow">
          <div className="tiny semi" style={{ marginBottom: 4 }}>{t("bset_dlv_min_order")}</div>
          {money(minOrder, setMinOrder, !parsed.ok && (toInt(minOrder) === null || Number.isNaN(toInt(minOrder) as number)))}
        </div>
      </div>

      <div>
        <div className="tiny semi" style={{ marginBottom: 4 }}>{t("bset_dlv_free_above")}</div>
        {money(freeAbove, setFreeAbove, false)}
        <div className="tiny muted" style={{ marginTop: 4 }}>{t("bset_dlv_free_above_hint")}</div>
      </div>

      <div>
        <div className="tiny semi" style={{ marginBottom: 4 }}>{t("bset_dlv_prep")}</div>
        <input
          className="input"
          inputMode="numeric"
          value={prep}
          onChange={(e) => setPrep(e.target.value.replace(/[^\d]/g, ""))}
          style={{ maxWidth: 120 }}
        />
      </div>

      <label className="row gap-10" style={{ alignItems: "flex-start", cursor: "pointer" }}>
        <input type="checkbox" checked={proof} onChange={(e) => { haptics.selection(); setProof(e.target.checked); }} style={{ marginTop: 3 }} />
        <span className="col" style={{ gap: 2 }}>
          <span className="tiny semi">{t("bset_dlv_proof")}</span>
          <span className="tiny muted" style={{ lineHeight: 1.45 }}>{t("bset_dlv_proof_hint")}</span>
        </span>
      </label>

      {preview && (
        <div className="card card-condensed" style={{ background: "var(--delivery-50)", border: "1px solid var(--delivery-100, var(--ink-200))" }}>
          <div className="small" style={{ color: "var(--delivery-600)", lineHeight: 1.45 }}>{preview}</div>
        </div>
      )}

      <button className="btn btn-primary btn-sm" disabled={!dirty || !parsed.ok || saving} onClick={save}>
        {saving ? t("loading") : t("bset_dlv_save")}
      </button>
    </div>
  );
}
