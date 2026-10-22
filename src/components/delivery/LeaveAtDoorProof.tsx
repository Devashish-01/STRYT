import { useEffect, useRef, useState } from "react";
import { Camera } from "@/components/Icons";
import { useApp } from "@/store";
import { useI18n } from "@/lib/i18n";
import { useQuery } from "@/hooks/useApi";
import { haptics } from "@/lib/haptics";
import { errorMessage } from "@/lib/errorMessage";
import { uploadService } from "@/services";
import { deliveryService, type DeliveryItem } from "@/services/engagement/deliveryService";

/** How long the rider must have waited at the door before leaving the order (enforced by delivery_record_proof). */
export const PROOF_WAIT_MIN = 5;

/**
 * The rider's alternative to the handoff code: leave a prepaid order at the door and photograph it. It only appears when the
 * shop has turned this on, the order needs no money collected, and the rider has arrived — the server decides, this just asks
 * (delivery_proof → canRecord) and shows the countdown while the rider waits. After the photo is recorded the delivery is
 * completed through the usual "delivered" step, which accepts the photo in place of the code.
 */
export default function LeaveAtDoorProof({ delivery, onComplete }: { delivery: DeliveryItem; onComplete: (d: DeliveryItem) => Promise<void> }) {
  const { t, tf } = useI18n();
  const { showToast } = useApp();
  const owes = delivery.amountDue > 0 && !delivery.cashCollectedAt;
  const { data: info, refetch } = useQuery(
    () => (owes ? Promise.resolve(null) : deliveryService.proofInfo(delivery.id)),
    [delivery.id, owes],
    `delivery:proof:${delivery.id}`,
  );
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // While waiting out the five minutes, look again every 30 seconds so the countdown and the button follow the server's clock.
  const waiting = !!info?.canRecord && (info.waitedMin ?? 0) < PROOF_WAIT_MIN;
  useEffect(() => {
    if (!waiting) return;
    const id = setInterval(() => refetch(), 30_000);
    return () => clearInterval(id);
  }, [waiting, refetch]);

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  if (!info?.canRecord) return null;
  const remaining = Math.max(1, PROOF_WAIT_MIN - (info.waitedMin ?? 0));

  async function submit() {
    if (!file || busy) return;
    setBusy(true);
    haptics.medium();
    try {
      const url = await uploadService.upload(file, "delivery-proof");
      await deliveryService.recordProof(delivery.id, url);
      await onComplete(delivery);
    } catch (e) {
      showToast(errorMessage(e, t("dlv_proof_err")));
      refetch();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="col gap-8" style={{ padding: "12px 14px", borderRadius: 14, border: "1px dashed var(--line)", background: "var(--surface-muted)" }}>
      <div className="semi small">{t("dlv_proof_title")}</div>
      <div className="tiny muted" style={{ lineHeight: 1.45 }}>{t("dlv_proof_hint")}</div>

      {waiting ? (
        <div className="tiny semi" style={{ color: "var(--amber-800)" }}>{tf("dlv_proof_wait", { n: remaining })}</div>
      ) : (
        <>
          <input
            ref={input}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: "none" }}
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); e.target.value = ""; }}
          />
          {preview ? (
            <img src={preview} alt={t("dlv_proof_alt")} style={{ width: "100%", maxHeight: 180, objectFit: "cover", borderRadius: 12 }} />
          ) : null}
          <div className="row gap-8">
            <button className="btn btn-outline row gap-6 center grow" disabled={busy} onClick={() => input.current?.click()}>
              <Camera size={16} /> {file ? t("dlv_proof_retake") : t("dlv_proof_take")}
            </button>
            {file && (
              <button className="btn btn-primary grow" disabled={busy} onClick={() => void submit()}>
                {busy ? "…" : t("dlv_proof_submit")}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
