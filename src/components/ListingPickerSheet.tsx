import { useState } from "react";
import { SafeImg } from "./common";
import { Search } from "@/components/Icons";
import { discoveryService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { useApp } from "@/store";
import { displayName as safeName } from "@/lib/publicName";

export interface PickedListing {
  listingType: "BUSINESS" | "PROVIDER";
  listingId: string;
  name: string;
}

/**
 * Bottom sheet for choosing a nearby business or provider.
 *
 * Extracted from the `RecommendSheet` that lived inside components/cards.tsx so
 * the composer can reuse it for "tag a business" on a shoutout/ask. Both entry
 * points want the identical thing — search the same nearby listings, return one
 * pick — and duplicating it would have meant two search behaviours drifting
 * apart in the same feature.
 */
export default function ListingPickerSheet({
  title = "Choose a place",
  onPick,
  onClose,
}: {
  title?: string;
  onPick: (picked: PickedListing) => void;
  onClose: () => void;
}) {
  const { user } = useApp();
  const [q, setQ] = useState("");
  const { data: bizPage, loading: bizLoading } = useQuery(
    () => discoveryService.businesses({ lat: user.lat || undefined, lng: user.lng || undefined }),
    [user.lat, user.lng]
  );
  const { data: provPage, loading: provLoading } = useQuery(
    () => discoveryService.providers({ lat: user.lat || undefined, lng: user.lng || undefined }),
    [user.lat, user.lng]
  );
  const lq = q.trim().toLowerCase();
  const filteredBiz = (bizPage?.data ?? []).filter((b) => b.name.toLowerCase().includes(lq));
  const filteredProv = (provPage?.data ?? []).filter((p) => p.displayName.toLowerCase().includes(lq));
  const loading = bizLoading || provLoading;
  const empty = !loading && filteredBiz.length === 0 && filteredProv.length === 0;

  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="sheet"
        onClick={(e) => e.stopPropagation()}
        style={{ maxHeight: "72vh", display: "flex", flexDirection: "column" }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="sheet-grab" />
        <div className="bold" style={{ fontSize: 17, marginBottom: 12 }}>{title}</div>
        <div
          className="row gap-8"
          style={{ border: "1.5px solid var(--ink-200)", borderRadius: 14, padding: "0 12px", marginBottom: 12, background: "var(--surface)" }}
        >
          <Search size={15} color="var(--ink-400)" />
          <input
            className="input"
            style={{ border: "none", padding: "10px 0", fontSize: 14 }}
            placeholder="Search businesses or providers…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search businesses or providers"
          />
        </div>
        <div style={{ overflowY: "auto", flex: 1 }}>
          {loading && <p className="small muted center" style={{ padding: 20 }}>Loading nearby places…</p>}
          {filteredBiz.map((b) => (
            <button
              key={b.id}
              className="row gap-12"
              style={{ width: "100%", padding: "10px 0", borderBottom: "1px solid var(--line)", textAlign: "left" }}
              onClick={() => onPick({ listingType: "BUSINESS", listingId: b.id, name: b.name })}
            >
              <SafeImg src={b.coverImage} className="thumb" style={{ width: 40, height: 40, borderRadius: 8 }} />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="semi small ellipsis">{b.name}</div>
                <div className="tiny muted ellipsis">{b.subCategory}</div>
              </div>
            </button>
          ))}
          {filteredProv.map((p) => (
            <button
              key={p.id}
              className="row gap-12"
              style={{ width: "100%", padding: "10px 0", borderBottom: "1px solid var(--line)", textAlign: "left" }}
              onClick={() => onPick({ listingType: "PROVIDER", listingId: p.id, name: safeName(p.displayName, "Local provider") })}
            >
              <SafeImg src={p.avatar} variant="avatar" className="avatar" style={{ width: 40, height: 40 }} />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="semi small ellipsis">{safeName(p.displayName, "Local provider")}</div>
                <div className="tiny muted ellipsis">{p.categoryName}</div>
              </div>
            </button>
          ))}
          {empty && (
            <p className="small muted center" style={{ padding: 24 }}>
              {lq ? `No results for "${q}"` : "No nearby places found yet."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
