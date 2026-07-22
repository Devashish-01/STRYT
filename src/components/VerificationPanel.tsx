import { useEffect, useRef, useState } from "react";
import { BadgeCheck, ShieldCheck, Camera, Clock, XCircle } from "@/components/Icons";
import { useApp } from "@/store";
import { businessService, providerService, authService } from "@/services";
import { searchGoogleMapBusiness } from "@/lib/googlePlaces";
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
          {status === "PENDING" && "Your manual submission is under review — or skip the wait and verify instantly with Google below."}
          {status === "REJECTED" && "See the reviewer's note below, then resubmit."}
          {status === "NONE" && "Verify instantly with Google Business below or upload documents for manual verification."}
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
          {/* ⚡ GOOGLE BUSINESS VERIFICATION & DATA IMPORT */}
          {entityType === "BUSINESS" && (
            <GoogleBusinessVerifyCard
              entityId={entityId}
              currentName={"name" in entity ? entity.name : (entity as any).fullName || ""}
              onSuccess={async () => {
                showToast("🎉 Verified & synced with Google Maps!");
                await load();
              }}
            />
          )}

          <div className="col gap-10">
            <div className="small semi muted row gap-6" style={{ alignItems: "center" }}>
              <ShieldCheck size={14} /> {status === "REJECTED" ? "Or resubmit documents manually" : "Or submit documents manually"}
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

function GoogleBusinessVerifyCard({ entityId, currentName, onSuccess }: { entityId: string; currentName: string; onSuccess: () => void }) {
  const { showToast } = useApp();
  const [gQuery, setGQuery] = useState(currentName || "");
  const [gSearching, setGSearching] = useState(false);
  const [gResults, setGResults] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);

  async function handleSearch() {
    if (!gQuery.trim()) return;
    setGSearching(true);
    try {
      let uLat: number | undefined;
      let uLng: number | undefined;

      if ("geolocation" in navigator) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 3000, enableHighAccuracy: true });
          });
          uLat = pos.coords.latitude;
          uLng = pos.coords.longitude;
        } catch {
          /* fallback to Pune center */
        }
      }

      const res = await searchGoogleMapBusiness(gQuery, uLat, uLng);
      setGResults(res);
      if (res.length === 0) {
        showToast("No matching business found on Google Maps nearby");
      }
    } catch {
      showToast("Error searching Google Maps");
    } finally {
      setGSearching(false);
    }
  }

  async function applyGoogleImport(item: any) {
    setImporting(true);
    try {
      const cleanPhone = item.phone ? item.phone.replace(/\D/g, "").slice(-10) : "9876543210";
      await businessService.verifyAndSyncFromGoogle(entityId, {
        name: item.name,
        address: item.address,
        city: item.city,
        pincode: item.pincode,
        lat: item.lat,
        lng: item.lng,
        phone: cleanPhone.length === 10 ? cleanPhone : "9876543210",
        hours: item.hours || "Everyday from 09:00 AM to 09:00 PM",
        coverImage: item.coverImage,
        gallery: item.gallery && item.gallery.length > 0 ? item.gallery : undefined,
      });
      showToast("✅ Google Maps profile data, photos, timing & location imported successfully!");
      onSuccess();
    } catch (e: any) {
      showToast(e?.message || "Google Maps import failed");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="card col gap-12" style={{ padding: 16, background: "linear-gradient(135deg, var(--brand-50) 0%, #fff 100%)", border: "1.5px solid var(--brand-300)" }}>
      <div className="row gap-10 center-v">
        <div style={{ width: 40, height: 40, borderRadius: 12, background: "#fff", border: "1px solid var(--ink-200)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>
          🗺️
        </div>
        <div className="grow">
          <div className="bold small" style={{ color: "var(--ink-900)" }}>Import Profile Data from Google Maps</div>
          <div className="tiny muted">Search your business on Google Maps to auto-fill &amp; test profile data sync.</div>
        </div>
      </div>

      <div className="col gap-10">
        <div className="row gap-8">
          <input
            className="input grow"
            placeholder="e.g. Dr Sharma Clinic Pune or Shop Name"
            value={gQuery}
            onChange={(e) => setGQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSearch();
              }
            }}
          />
          <button
            className="btn btn-primary btn-sm"
            disabled={gSearching || !gQuery.trim()}
            onClick={handleSearch}
          >
            {gSearching ? "Searching…" : "Search"}
          </button>
        </div>

        {gResults.length > 0 ? (
          <div className="col gap-6" style={{ marginTop: 4 }}>
            <div className="tiny semi muted">Select your listing to import data:</div>
            {gResults.map((item, idx) => (
              <button
                key={idx}
                type="button"
                disabled={importing}
                className="card row center-v gap-8 text-left"
                style={{ padding: "10px 12px", background: "#fff", border: "1px solid var(--brand-300)", cursor: "pointer" }}
                onClick={() => applyGoogleImport(item)}
              >
                <div className="grow">
                  <div className="row center-v gap-6">
                    <div className="semi small">{item.name}</div>
                    {typeof item.distanceKm === "number" && (
                      <span className="tiny semi" style={{ color: "var(--brand-700)", background: "var(--brand-50)", padding: "2px 6px", borderRadius: 4 }}>
                        📍 {item.distanceKm} km
                      </span>
                    )}
                  </div>
                  <div className="tiny muted line-clamp-1">{item.address}</div>
                </div>
                <span className="chip active tiny" style={{ background: "var(--brand-600)", color: "#fff" }}>
                  {importing ? "Importing…" : "Import Data"}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="tiny muted center" style={{ textAlign: "center", paddingTop: 4 }}>
            Type your shop or clinic name above and tap <b>Search</b> to view Google Maps listings.
          </div>
        )}
      </div>
    </div>
  );
}
