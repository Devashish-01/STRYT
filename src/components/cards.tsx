import { useNavigate } from "react-router-dom";
import { Heart, MapPin, Clock, BadgeCheck, Zap, Eye, Users, Flame, Repeat } from "lucide-react";
import type { Business, Provider, RequestPost } from "@/types";
import { Rating, inr, SafeImg } from "./common";
import { useApp } from "@/store";
import { requestService } from "@/services";
import { evaluateProviderAvailability } from "@/utils/availability";
import { displayName as safeName } from "@/lib/publicName";
import { distanceLabel } from "@/lib/format";

/* ---------------- Business cards ---------------- */

export function BusinessCardWide({ b }: { b: Business }) {
  const nav = useNavigate();
  const { isBookmarked, toggleBookmark } = useApp();
  const saved = isBookmarked("BUSINESS", b.id);
  // Live open/closed from the owner's presence toggle + working hours — same
  // evaluator BusinessDetail uses, so the card can't show a stale "Open".
  const evalRes = evaluateProviderAvailability(b.hours, b.isAvailableNow, b.availableUntil);
  return (
    <div className="card fade-up" style={{ overflow: "hidden" }} onClick={() => nav(`/business/${b.id}`)}>
      <div style={{ position: "relative" }}>
        <img src={b.coverImage} alt={b.name} className="thumb" style={{ width: "100%", height: 150 }} loading="lazy" />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(to top, rgba(0,0,0,0.55), transparent 55%)",
          }}
        />
        {b.offerText && (
          <div
            style={{
              position: "absolute",
              left: 10,
              bottom: 10,
              color: "#fff",
              fontWeight: 800,
              fontSize: 15,
              textShadow: "0 1px 4px rgba(0,0,0,0.4)",
            }}
          >
            {b.offerText}
          </div>
        )}
        <button
          className="icon-btn"
          style={{ position: "absolute", top: 10, right: 10, background: "rgba(255,255,255,0.92)" }}
          onClick={(e) => {
            e.stopPropagation();
            toggleBookmark("BUSINESS", b.id);
          }}
          aria-label="Save"
        >
          <Heart size={18} fill={saved ? "var(--red-500)" : "none"} color={saved ? "var(--red-500)" : "#5c5573"} />
        </button>
        {b.isNew && (
          <span className="badge badge-new" style={{ position: "absolute", top: 12, left: 10 }}>
            ● NEW
          </span>
        )}
      </div>
      <div style={{ padding: 12 }}>
        <div className="row between">
          <div className="row gap-6" style={{ minWidth: 0 }}>
            <span className="bold ellipsis" style={{ fontSize: 16 }}>{b.name}</span>
            {b.isVerified && <BadgeCheck size={16} color="#e5521c" fill="#ffe8e2" />}
          </div>
          <Rating value={b.ratingAvg} />
        </div>
        <div className="tiny muted ellipsis" style={{ marginTop: 3 }}>
          {b.subCategory} {b.priceForTwo ? `• ${inr(b.priceForTwo)} for two` : ""}
        </div>
        <div className="row gap-10 tiny muted" style={{ marginTop: 8 }}>
          <span className="row gap-4"><MapPin size={13} /> {distanceLabel(b.distanceKm)}</span>
          {b.deliveryTime && <span className="row gap-4"><Clock size={13} /> {b.deliveryTime}</span>}
          <span style={{ color: evalRes.isOpenNow ? "var(--green-500)" : "var(--red-600)", fontWeight: 700 }}>
            {evalRes.isOpenNow ? "Open" : "Closed"}
          </span>
        </div>
      </div>
    </div>
  );
}

export function BusinessCardSmall({ b }: { b: Business }) {
  const nav = useNavigate();
  const evalRes = evaluateProviderAvailability(b.hours, b.isAvailableNow, b.availableUntil);
  return (
    <div
      className="fade-up"
      style={{ width: 160, flexShrink: 0 }}
      onClick={() => nav(`/business/${b.id}`)}
    >
      <div style={{ position: "relative" }}>
        <img src={b.coverImage} alt={b.name} className="thumb" style={{ width: "100%", height: 110, borderRadius: 16 }} loading="lazy" />
        {b.offerText && (
          <div
            style={{
              position: "absolute",
              left: 8,
              bottom: 8,
              right: 8,
              color: "#fff",
              fontWeight: 800,
              fontSize: 12,
              textShadow: "0 1px 4px rgba(0,0,0,0.6)",
            }}
            className="ellipsis"
          >
            {b.offerText}
          </div>
        )}
        {b.isNew && (
          <span className="badge badge-new" style={{ position: "absolute", top: 8, left: 8, fontSize: 10 }}>
            NEW
          </span>
        )}
      </div>
      <div style={{ marginTop: 7 }}>
        <div className="row between gap-6">
          <span className="bold ellipsis small">{b.name}</span>
        </div>
        <div className="row gap-6" style={{ marginTop: 3 }}>
          <Rating value={b.ratingAvg} size={11} />
          <span className="tiny muted ellipsis">{distanceLabel(b.distanceKm)}</span>
        </div>
        <span className="tiny" style={{ color: evalRes.isOpenNow ? "var(--green-500)" : "var(--red-600)", fontWeight: 700 }}>
          {evalRes.isOpenNow ? "Open" : "Closed"}
        </span>
      </div>
    </div>
  );
}

/* ---------------- Provider card ---------------- */

export function ProviderCard({ p }: { p: Provider }) {
  const nav = useNavigate();
  const { isBookmarked, toggleBookmark } = useApp();
  const saved = isBookmarked("PROVIDER", p.id);
  const evalRes = evaluateProviderAvailability(p.availabilityNote, p.isAvailableNow, p.availableUntil);
  return (
    <div className="card fade-up" style={{ padding: 12 }} onClick={() => nav(`/provider/${p.id}`)}>
      <div className="row gap-12" style={{ alignItems: "flex-start" }}>
        <div style={{ position: "relative" }}>
          <SafeImg src={p.avatar} alt={p.displayName} variant="avatar" className="avatar" style={{ width: 56, height: 56 }} />
          <span
            style={{
              position: "absolute",
              bottom: 2,
              right: 2,
              width: 14,
              height: 14,
              borderRadius: "50%",
              background: evalRes.isOpenNow ? "var(--green-500)" : "#9ca3af",
              border: "2px solid #fff",
            }}
          />
        </div>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row between">
            <div className="row gap-6" style={{ minWidth: 0 }}>
              <span className="bold ellipsis" style={{ fontSize: 15 }}>{safeName(p.displayName, "Local provider")}</span>
              {p.isVerified && <BadgeCheck size={15} color="#e5521c" fill="#ffe8e2" />}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleBookmark("PROVIDER", p.id);
              }}
              aria-label="Save"
            >
              <Heart size={18} fill={saved ? "var(--red-500)" : "none"} color={saved ? "var(--red-500)" : "#a9a3bd"} />
            </button>
          </div>
          <div className="tiny muted" style={{ marginTop: 1 }}>{p.categoryName} • {p.subCategory}</div>
          <div className="row gap-8 center-v" style={{ marginTop: 6 }}>
            <Rating value={p.ratingAvg} size={11} />
            {p.jobsDone > 0 && <span className="tiny muted">{p.jobsDone} jobs</span>}
            <span className="tiny muted">• {distanceLabel(p.distanceKm)}</span>
            <span
              className={`badge ${evalRes.isOpenNow ? "badge-green" : "badge-gray"}`}
              style={{ fontSize: 10, padding: "1px 6px", marginLeft: "auto" }}
            >
              {evalRes.isOpenNow ? "Available" : "Offline"}
            </span>
          </div>
        </div>
      </div>
      <div className="row wrap gap-6" style={{ marginTop: 10 }}>
        {p.skills.slice(0, 3).map((s) => (
          <span key={s} className="badge badge-gray">{s}</span>
        ))}
      </div>
      <div className="row between" style={{ marginTop: 11 }}>
        <div>
          <span className="tiny muted">Starts at </span>
          <span className="bold" style={{ color: "var(--green-500)" }}>{inr(p.startingPrice)}</span>
        </div>
        {p.responseTime && <span className="tiny muted row gap-4"><Clock size={12} /> Responds {p.responseTime}</span>}
      </div>
    </div>
  );
}

export function ProviderCardSmall({ p }: { p: Provider }) {
  const nav = useNavigate();
  return (
    <div className="card fade-up" style={{ width: 150, flexShrink: 0, padding: 12 }} onClick={() => nav(`/provider/${p.id}`)}>
      <div className="col center" style={{ textAlign: "center", gap: 6 }}>
        <SafeImg src={p.avatar} alt={p.displayName} variant="avatar" className="avatar" style={{ width: 60, height: 60 }} />
        <div className="bold small ellipsis" style={{ maxWidth: "100%" }}>{safeName(p.displayName, "Local provider")}</div>
        <div className="tiny muted ellipsis" style={{ maxWidth: "100%" }}>{p.categoryName}</div>
        <Rating value={p.ratingAvg} size={11} />
        <div className="tiny" style={{ color: "var(--green-500)", fontWeight: 700 }}>from {inr(p.startingPrice)}</div>
      </div>
    </div>
  );
}

/* ---------------- Request card ---------------- */

// Lifecycle badge for a request past the OPEN stage — makes auto-archival
// (EXPIRED) and deal progress visible instead of every card looking "live".
const REQUEST_STATUS_BADGE: Record<string, { label: string; cls: string } | null> = {
  OPEN: null,
  AGREED: { label: "In progress", cls: "badge-blue" },
  IN_PROGRESS: { label: "In progress", cls: "badge-blue" },
  COMPLETED: { label: "Completed", cls: "badge-green" },
  CANCELLED: { label: "Cancelled", cls: "badge-gray" },
  EXPIRED: { label: "Expired", cls: "badge-gray" },
};

export function RequestCard({ r }: { r: RequestPost }) {
  const nav = useNavigate();
  const { meToos, toggleMeToo } = useApp();
  const budget =
    r.budgetMin && r.budgetMax ? `${inr(r.budgetMin)}–${inr(r.budgetMax)}` : "Open budget";
  const meTooed = meToos.includes(r.id) || r.meTooed;
  const meTooCount = (r.meTooCount ?? 0) + (meTooed && !r.meTooed ? 1 : 0);
  const isOpen = r.status === "OPEN";
  const statusBadge = REQUEST_STATUS_BADGE[r.status] ?? null;
  const archived = r.status === "EXPIRED" || r.status === "CANCELLED";
  return (
    <div
      className="card fade-up"
      style={{ padding: 14, border: r.isUrgent && isOpen ? "1.5px solid #fecaca" : undefined, opacity: archived ? 0.62 : 1 }}
      onClick={() => nav(`/request/${r.id}`)}
    >
      <div className="row gap-10" style={{ alignItems: "flex-start" }}>
        <SafeImg src={r.requesterAvatar} alt={r.requesterName} variant="avatar" className="avatar" style={{ width: 40, height: 40 }} />
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row between">
            <span className="semi small">{r.isAnonymous ? "Someone nearby" : r.requesterName}</span>
            <span className="tiny muted">{r.postedAt}</span>
          </div>
          <div className="row gap-6 tiny muted">
            <MapPin size={12} /> {r.area}{r.distanceKm > 0 ? ` • ${r.distanceKm} km away` : ""}
          </div>
        </div>
      </div>

      <div className="row gap-8" style={{ marginTop: 10, alignItems: "flex-start" }}>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row wrap gap-6" style={{ marginBottom: 4 }}>
            {statusBadge && <span className={`badge ${statusBadge.cls}`}>{statusBadge.label}</span>}
            {isOpen && r.isUrgent && <span className="badge badge-red"><Flame size={11} /> Urgent</span>}
            {isOpen && r.isBoosted && <span className="badge badge-amber"><Zap size={11} /> Boosted</span>}
            {r.isGroupBuy && <span className="badge badge-green"><Users size={11} /> Group buy</span>}
            {r.isRecurring && <span className="badge badge-blue"><Repeat size={11} /> Recurring</span>}
            <span className="badge badge-purple">{r.categoryName}</span>
          </div>
          <div className="bold" style={{ fontSize: 15.5 }}>{r.title}</div>
          <p className="small muted clamp-2" style={{ marginTop: 4, lineHeight: 1.45 }}>{r.description}</p>
        </div>
        {r.photos[0] && (
          <img src={r.photos[0]} alt="" className="thumb" style={{ width: 64, height: 64, borderRadius: 12 }} loading="lazy" />
        )}
      </div>

      {/* Group buy progress */}
      {r.isGroupBuy && r.groupBuyTarget && (
        <div style={{ marginTop: 10 }}>
          <div className="row between tiny" style={{ marginBottom: 4 }}>
            <span className="semi" style={{ color: "var(--green-500)" }}>{meTooCount} of {r.groupBuyTarget} joined</span>
            <span className="muted">unlocks bulk price</span>
          </div>
          <div style={{ height: 7, borderRadius: 6, background: "var(--ink-100)", overflow: "hidden" }}>
            <div style={{ width: `${Math.min(100, (meTooCount / r.groupBuyTarget) * 100)}%`, height: "100%", background: "linear-gradient(90deg,var(--green-500),#4ade80)" }} />
          </div>
        </div>
      )}

      <div className="divider" style={{ margin: "12px 0" }} />

      <div className="row between">
        <div className="col" style={{ gap: 2 }}>
          <span className="tiny muted">Budget</span>
          <span className="bold" style={{ color: "var(--green-500)" }}>{budget}</span>
        </div>
        {isOpen ? (
          <button
            className="row gap-4 chip"
            style={{ padding: "7px 12px", background: meTooed ? "var(--brand-800)" : "#fff", color: meTooed ? "#fff" : "var(--ink-700)", borderColor: meTooed ? "var(--brand-800)" : "var(--ink-200)" }}
            onClick={(e) => {
              e.stopPropagation();
              toggleMeToo(r.id);
              requestService.meToo(r.id).catch(() => toggleMeToo(r.id));
            }}
          >
            <Users size={13} /> {meTooed ? "Me too ✓" : "Me too"} {meTooCount > 0 && `· ${meTooCount}`}
          </button>
        ) : (
          meTooCount > 0 && (
            <span className="row gap-4 tiny muted" style={{ alignItems: "center" }}>
              <Users size={13} /> {meTooCount} interested
            </span>
          )
        )}
        <div className="col" style={{ gap: 2, alignItems: "flex-end" }}>
          <span className="tiny muted row gap-4"><Eye size={11} /> {r.viewCount}</span>
          <span className="semi small" style={{ color: "var(--brand-700)" }}>
            {r.proposals.length} {r.proposals.length === 1 ? "offer" : "offers"}
          </span>
        </div>
      </div>
    </div>
  );
}
