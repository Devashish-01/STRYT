import { useState } from "react";
import { businessService } from "@/services";
import { searchGoogleMapBusiness } from "@/lib/googlePlaces";
import { useApp } from "@/store";

/**
 * GoogleImportCard
 *
 * A storefront convenience: search your business on the map and pull in your
 * public details (name, address text, phone, hours, photos) to auto-fill the
 * profile. This is purely a DATA IMPORT — it does NOT verify the business
 * (verification is a separate, reviewed step) and it does NOT move the business
 * location (that is frozen and only changes via an admin-approved request), so
 * latitude/longitude are intentionally excluded here.
 *
 * Placeholder/synthetic values from open-data fallbacks (e.g. a dummy phone or
 * generic hours) are filtered out so importing a weak match never clobbers real
 * details the owner already entered.
 */

const SYNTHETIC_PHONE = "9876543210";
const SYNTHETIC_HOURS = "Everyday from 09:00 AM to 09:00 PM";

export default function GoogleImportCard({
  entityId,
  currentName,
  onSuccess,
}: {
  entityId: string;
  currentName: string;
  onSuccess: () => void;
}) {
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
          /* fallback to default reference location */
        }
      }

      const res = await searchGoogleMapBusiness(gQuery, uLat, uLng);
      setGResults(res);
      if (res.length === 0) {
        showToast("No matching listing found nearby");
      }
    } catch {
      showToast("Error searching the map");
    } finally {
      setGSearching(false);
    }
  }

  async function applyGoogleImport(item: any) {
    setImporting(true);
    try {
      // Only real 10-digit phones — never the open-data placeholder.
      const digits = (item.phone ? String(item.phone).replace(/\D/g, "") : "").slice(-10);
      const phone = digits.length === 10 && digits !== SYNTHETIC_PHONE ? digits : undefined;
      const hours = item.hours && item.hours !== SYNTHETIC_HOURS ? item.hours : undefined;

      // NOTE: lat/lng deliberately omitted — the business location is frozen and
      // only changes via requestLocationChange() -> admin approval.
      await businessService.verifyAndSyncFromGoogle(entityId, {
        name: item.name || undefined,
        address: item.address || undefined,
        city: item.city || undefined,
        pincode: item.pincode || undefined,
        phone,
        hours,
        coverImage: item.coverImage || undefined,
        gallery: item.gallery && item.gallery.length > 0 ? item.gallery : undefined,
      });
      showToast("✅ Details imported from the map");
      onSuccess();
    } catch (e: any) {
      showToast(e?.message || "Import failed");
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
          <div className="bold small" style={{ color: "var(--ink-900)" }}>Import details from the map</div>
          <div className="tiny muted">Find your business to auto-fill name, address, phone, hours &amp; photos. Location isn't changed here.</div>
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
            <div className="tiny semi muted">Select your listing to import details:</div>
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
                  {importing ? "Importing…" : "Import"}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="tiny muted center" style={{ textAlign: "center", paddingTop: 4 }}>
            Type your shop or clinic name above and tap <b>Search</b> to view nearby listings.
          </div>
        )}
      </div>
    </div>
  );
}
