import { useEffect, useRef, useState } from "react";
import { BadgeCheck, ShieldCheck, Camera, Clock, XCircle } from "@/components/Icons";
import { useApp } from "@/store";
import { businessService, providerService } from "@/services";
import type { Business, Provider } from "@/types";

type EntityType = "BUSINESS" | "PROVIDER";

/**
 * The apply/status screen for STRYT's manual verification program — shared
 * by businesses and providers since the flow is identical: upload documents,
 * wait for a human reviewer, see the outcome. Approval/rejection can only
 * ever be written by the verification-review Edge Function (a DB trigger
 * blocks any other caller), so nothing here can grant the badge itself —
 * this screen only ever submits into UNDER_REVIEW.
 */
export default function VerificationPanel({ entityType, entityId }: { entityType: EntityType; entityId: string }) {
  const { showToast } = useApp();
  const [entity, setEntity] = useState<Business | Provider | null>(null);
  const [loading, setLoading] = useState(true);
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const svc = entityType === "BUSINESS" ? businessService : providerService;

  async function load() {
    setLoading(true);
    const e = await (svc.get as (id: string) => Promise<Business | Provider | undefined>)(entityId);
    setEntity(e ?? null);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId]);

  function addFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    setFiles((prev) => [...prev, ...picked].slice(0, 5));
    e.target.value = "";
  }

  function removeFile(i: number) {
    setFiles((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function submit() {
    if (files.length === 0) {
      showToast("Add at least one document");
      return;
    }
    setSubmitting(true);
    try {
      await (svc.submitVerification as (id: string, files: File[]) => Promise<unknown>)(entityId, files);
      showToast("Documents submitted — under review");
      setFiles([]);
      await load();
    } catch (e: any) {
      showToast(e?.message || "Couldn't submit documents");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="screen-scroll page-pad col center" style={{ paddingTop: 80 }}>
        <div className="muted small">Loading verification status...</div>
      </div>
    );
  }
  if (!entity) return null;

  const status: "VERIFIED" | "PENDING" | "REJECTED" | "NONE" = entity.isVerified
    ? "VERIFIED"
    : entity.verificationStatus === "UNDER_REVIEW"
    ? "PENDING"
    : entity.verificationStatus === "REJECTED"
    ? "REJECTED"
    : "NONE";

  return (
    <div className="screen-scroll page-pad col gap-16" style={{ paddingBottom: 30 }}>
      <input type="file" ref={fileInputRef} onChange={addFiles} style={{ display: "none" }} accept="image/*,application/pdf" multiple />

      <div
        className="card col center"
        style={{
          padding: 18,
          gap: 6,
          background: status === "VERIFIED" ? "var(--green-100)" : status === "REJECTED" ? "var(--red-50)" : "var(--brand-50)",
          border: "none",
        }}
      >
        {status === "VERIFIED" ? (
          <BadgeCheck size={42} color="var(--green-500)" />
        ) : status === "REJECTED" ? (
          <XCircle size={42} color="var(--red-500)" />
        ) : (
          <Clock size={42} color="var(--brand-700)" />
        )}
        <div className="bold">
          {status === "VERIFIED" && "STRYT Verified"}
          {status === "PENDING" && "Under review"}
          {status === "REJECTED" && "Not approved"}
          {status === "NONE" && "Not verified"}
        </div>
        <p className="tiny muted center" style={{ textAlign: "center" }}>
          {status === "VERIFIED" && "Your STRYT Verified badge is live on your public page."}
          {status === "PENDING" && "Your manual submission is under review."}
          {status === "REJECTED" && "See the reviewer's note below, then resubmit."}
          {status === "NONE" && "Upload documents below for manual verification."}
        </p>
      </div>

      {status === "REJECTED" && (entity as any).verificationReason && (
        <div className="card" style={{ background: "var(--red-50)", border: "1px solid var(--red-100)" }}>
          <div className="tiny semi" style={{ color: "var(--red-600)", marginBottom: 4 }}>Reviewer's note</div>
          <div className="small" style={{ color: "var(--red-700)" }}>{(entity as any).verificationReason}</div>
        </div>
      )}

      {status !== "VERIFIED" && (
        <div className="col gap-16">
          <div className="col gap-10">
            <div className="small semi muted row gap-6" style={{ alignItems: "center" }}>
              <ShieldCheck size={14} /> {status === "REJECTED" ? "Resubmit documents" : "Submit documents"}
            </div>

            {files.length > 0 && (
              <div className="col gap-6">
                {files.map((f, i) => (
                  <div key={i} className="row between card card-condensed" style={{ padding: "8px 12px" }}>
                    <span className="small ellipsis" style={{ maxWidth: 220 }}>{f.name}</span>
                    <button className="tiny semi" style={{ color: "var(--red-600)" }} onClick={() => removeFile(i)}>Remove</button>
                  </div>
                ))}
              </div>
            )}

            <button
              className="col center"
              style={{ width: "100%", padding: 22, borderRadius: 14, border: "2px dashed var(--ink-300)", color: "var(--ink-500)", gap: 6 }}
              onClick={() => fileInputRef.current?.click()}
              disabled={submitting}
            >
              <Camera size={26} />
              <span className="small semi">Add a document (ID, GST, license…)</span>
            </button>

            <button className="btn btn-primary btn-block" disabled={submitting || files.length === 0} onClick={submit}>
              {submitting ? "Submitting..." : "Submit for review"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
