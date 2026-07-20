import { useState, useMemo } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { useApp } from "@/store";
import { discoveryService, requestService, userService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import {
  ArrowLeft,
  Heart,
  Search,
  X,
  Store,
  Wrench,
  FileText,
  Users,
  BadgeCheck,
  Star,
  MapPin,
  Clock,
  UserCheck,
  UserPlus,
  MessageCircle,
  Share2,
  Sparkles,
  Sliders,
} from "@/components/Icons";
import { SafeImg, Rating, inr } from "@/components/common";
import { distanceLabel } from "@/lib/format";
import { evaluateProviderAvailability } from "@/utils/availability";
import { openProfile } from "@/lib/profileSheet";
import { haptics } from "@/lib/haptics";
import type { Business, Provider, RequestPost } from "@/types";

type TabType = "BUSINESS" | "PROVIDER" | "REQUEST" | "FOLLOWING";
type FilterType = "ALL" | "VERIFIED" | "NEARBY" | "TOP_RATED";

export default function Bookmarks() {
  const nav = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { bookmarks, follows, user, toggleBookmark, toggleFollow, isGuest } = useApp();

  // Determine active tab from path (/following -> FOLLOWING, /saved -> BUSINESS) or query param ?tab=
  const initialTab = useMemo<TabType>(() => {
    if (location.pathname === "/following") return "FOLLOWING";
    const q = searchParams.get("tab")?.toUpperCase();
    if (q === "BUSINESS" || q === "PROVIDER" || q === "REQUEST" || q === "FOLLOWING") {
      return q as TabType;
    }
    return "BUSINESS";
  }, [location.pathname, searchParams]);

  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<FilterType>("ALL");

  // Fetch live entities
  const { data: bizPage, loading: bizLoading } = useQuery(
    () => discoveryService.businesses({ lat: user.lat || undefined, lng: user.lng || undefined }),
    [user.lat, user.lng]
  );

  const { data: provPage, loading: provLoading } = useQuery(
    () => discoveryService.providers({ lat: user.lat || undefined, lng: user.lng || undefined }),
    [user.lat, user.lng]
  );

  const { data: reqPage, loading: reqLoading } = useQuery(
    () => requestService.feed({ lat: user.lat || undefined, lng: user.lng || undefined }),
    [user.lat, user.lng]
  );

  // Fetch profiles of followed users
  const followUserKeys = useMemo(
    () => follows.filter((f) => f.type.toUpperCase() === "USER"),
    [follows]
  );

  const { data: usersData, loading: usersLoading } = useQuery(async () => {
    if (followUserKeys.length === 0) return [];
    const profiles = await Promise.all(
      followUserKeys.map(async (k) => {
        try {
          return await userService.publicProfile(k.id);
        } catch {
          return undefined;
        }
      })
    );
    return profiles.filter(Boolean);
  }, [followUserKeys.length]);

  const allBiz = bizPage?.data ?? [];
  const allProv = provPage?.data ?? [];
  const allReq = reqPage?.data ?? [];
  const followUsers = (usersData ?? []).filter(Boolean);

  // Filter saved entities
  const savedBiz = useMemo(
    () => allBiz.filter((b) => bookmarks.some((m) => m.type.toUpperCase() === "BUSINESS" && m.id === b.id)),
    [allBiz, bookmarks]
  );

  const savedProv = useMemo(
    () => allProv.filter((p) => bookmarks.some((m) => m.type.toUpperCase() === "PROVIDER" && m.id === p.id)),
    [allProv, bookmarks]
  );

  const savedReq = useMemo(
    () => allReq.filter((r) => bookmarks.some((m) => m.type.toUpperCase() === "REQUEST" && m.id === r.id)),
    [allReq, bookmarks]
  );

  const followBiz = useMemo(
    () => allBiz.filter((b) => follows.some((f) => f.type.toUpperCase() === "BUSINESS" && f.id === b.id)),
    [allBiz, follows]
  );

  const followProv = useMemo(
    () => allProv.filter((p) => follows.some((f) => f.type.toUpperCase() === "PROVIDER" && f.id === p.id)),
    [allProv, follows]
  );

  const counts = {
    BUSINESS: savedBiz.length,
    PROVIDER: savedProv.length,
    REQUEST: savedReq.length,
    FOLLOWING: followBiz.length + followProv.length + followUsers.length,
  };

  const totalSavedCount = savedBiz.length + savedProv.length + savedReq.length;
  const isLoading = bizLoading || provLoading || reqLoading || usersLoading;

  // Search & filter logic
  const filteredBiz = useMemo(() => {
    return savedBiz.filter((b) => {
      const q = searchQuery.toLowerCase().trim();
      const cat = (b.categoryName || "").toLowerCase();
      const sub = (b.subCategory || "").toLowerCase();
      const city = (b.city || "").toLowerCase();

      const matchesSearch =
        !q ||
        b.name.toLowerCase().includes(q) ||
        cat.includes(q) ||
        sub.includes(q) ||
        city.includes(q);

      if (!matchesSearch) return false;
      if (filterType === "VERIFIED" && !b.isVerified) return false;
      if (filterType === "NEARBY" && (b.distanceKm === undefined || b.distanceKm > 3)) return false;
      if (filterType === "TOP_RATED" && (b.ratingAvg || 0) < 4.5) return false;
      return true;
    });
  }, [savedBiz, searchQuery, filterType]);

  const filteredProv = useMemo(() => {
    return savedProv.filter((p) => {
      const q = searchQuery.toLowerCase().trim();
      const cat = (p.categoryName || "").toLowerCase();
      const sub = (p.subCategory || "").toLowerCase();
      const bio = (p.bio || "").toLowerCase();

      const matchesSearch =
        !q ||
        p.displayName.toLowerCase().includes(q) ||
        cat.includes(q) ||
        sub.includes(q) ||
        bio.includes(q);

      if (!matchesSearch) return false;
      if (filterType === "VERIFIED" && !p.isVerified) return false;
      if (filterType === "NEARBY" && (p.distanceKm === undefined || p.distanceKm > 3)) return false;
      if (filterType === "TOP_RATED" && (p.ratingAvg || 0) < 4.5) return false;
      return true;
    });
  }, [savedProv, searchQuery, filterType]);

  const filteredReq = useMemo(() => {
    return savedReq.filter((r) => {
      const q = searchQuery.toLowerCase().trim();
      const cat = (r.categoryName || "").toLowerCase();
      const desc = (r.description || "").toLowerCase();

      const matchesSearch =
        !q ||
        r.title.toLowerCase().includes(q) ||
        cat.includes(q) ||
        desc.includes(q);

      if (!matchesSearch) return false;
      if (filterType === "NEARBY" && (r.distanceKm === undefined || r.distanceKm > 3)) return false;
      return true;
    });
  }, [savedReq, searchQuery, filterType]);

  const switchTab = (t: TabType) => {
    haptics.selection();
    setActiveTab(t);
    setSearchParams({ tab: t.toLowerCase() }, { replace: true });
  };

  const handleShare = (title: string, text: string) => {
    haptics.selection();
    if (navigator.share) {
      void navigator.share({ title, text, url: window.location.href });
    } else {
      void navigator.clipboard.writeText(window.location.href);
    }
  };

  return (
    <div className="screen" style={{ background: "var(--bg)" }}>
      {/* Apple Glassmorphic Header */}
      <header className="apple-glass-header page-pad" style={{ padding: "14px 16px 12px 16px" }}>
        <div className="row space-between center-v">
          <div className="row gap-12 center-v">
            <button
              className="icon-btn"
              onClick={() => nav(-1)}
              aria-label="Back"
              style={{
                width: 38,
                height: 38,
                borderRadius: "50%",
                background: "rgba(118, 118, 128, 0.12)",
                border: "none",
              }}
            >
              <ArrowLeft size={20} color="var(--ink-900)" />
            </button>
            <div>
              <h1 className="bold" style={{ fontSize: 22, margin: 0, letterSpacing: "-0.5px", color: "var(--ink-900)" }}>
                Saved & Following
              </h1>
              <p className="tiny muted" style={{ margin: "2px 0 0 0", fontSize: 12.5, fontWeight: 500 }}>
                {totalSavedCount} saved items · {counts.FOLLOWING} following
              </p>
            </div>
          </div>

          <button
            type="button"
            className="icon-btn"
            onClick={() => handleShare("My Stryt Collection", "Check out my saved shops, service pros and saved requests on Stryt!")}
            aria-label="Share collection"
            style={{
              width: 38,
              height: 38,
              borderRadius: "50%",
              background: "rgba(118, 118, 128, 0.12)",
              border: "none",
            }}
          >
            <Share2 size={18} color="var(--ink-700)" />
          </button>
        </div>

        {/* Search Bar */}
        <div style={{ marginTop: 12 }}>
          <div className="apple-search-box">
            <Search size={18} color="var(--ink-400)" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search saved shops, providers, asks, people..."
              style={{
                border: "none",
                background: "transparent",
                outline: "none",
                width: "100%",
                fontSize: 14,
                fontWeight: 500,
                color: "var(--ink-900)",
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  background: "var(--ink-300)",
                  border: "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 0,
                  cursor: "pointer",
                }}
              >
                <X size={12} color="#fff" />
              </button>
            )}
          </div>
        </div>

        {/* iOS Inset Segmented Control */}
        <div style={{ marginTop: 12 }}>
          <div className="apple-segmented-bar">
            {(
              [
                ["BUSINESS", "Shops", Store, counts.BUSINESS],
                ["PROVIDER", "Providers", Wrench, counts.PROVIDER],
                ["REQUEST", "Requests", FileText, counts.REQUEST],
                ["FOLLOWING", "Following", Users, counts.FOLLOWING],
              ] as [TabType, string, any, number][]
            ).map(([t, label, Icon, count]) => (
              <button
                key={t}
                onClick={() => switchTab(t)}
                className={`apple-segment-btn ${activeTab === t ? "active" : ""}`}
              >
                <Icon size={16} />
                <span>{label}</span>
                {count > 0 && (
                  <span
                    className="apple-badge-pill"
                    style={{
                      background: activeTab === t ? "var(--brand-100)" : "rgba(118, 118, 128, 0.15)",
                      color: activeTab === t ? "var(--brand-700)" : "var(--ink-600)",
                    }}
                  >
                    {count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Quick Filter Chips (for Shops, Providers, Requests) */}
        {activeTab !== "FOLLOWING" && (
          <div className="row gap-8" style={{ marginTop: 10, overflowX: "auto", paddingBottom: 2 }}>
            {(
              [
                ["ALL", "All"],
                ["VERIFIED", "Verified Only"],
                ["NEARBY", "Nearby (< 3km)"],
                ["TOP_RATED", "Top Rated (4.5+ ★)"],
              ] as [FilterType, string][]
            ).map(([f, label]) => (
              <button
                key={f}
                onClick={() => {
                  haptics.selection();
                  setFilterType(f);
                }}
                className={`apple-chip ${filterType === f ? "active" : ""}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <main className="screen-scroll page-pad col gap-16" style={{ paddingTop: 14, paddingBottom: 40 }}>
        {isLoading ? (
          <div className="col gap-14">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="apple-card"
                style={{ height: 110, background: "linear-gradient(90deg, var(--ink-100) 25%, var(--ink-200) 50%, var(--ink-100) 75%)" }}
              />
            ))}
          </div>
        ) : (
          <>
            {/* SHOPS TAB */}
            {activeTab === "BUSINESS" && (
              <>
                {filteredBiz.length > 0 ? (
                  filteredBiz.map((b) => <AppleBusinessCard key={b.id} b={b} nav={nav} toggleBookmark={toggleBookmark} isGuest={isGuest} />)
                ) : (
                  <AppleEmptyState
                    icon={Store}
                    title={searchQuery || filterType !== "ALL" ? "No matching saved shops" : "No shops saved yet"}
                    text={
                      searchQuery || filterType !== "ALL"
                        ? "Try resetting your search or filter to see all saved shops."
                        : "Tap the heart icon on any local shop profile to save it here for quick access."
                    }
                    actionLabel="Explore Shops"
                    onAction={() => nav("/explore")}
                  />
                )}
              </>
            )}

            {/* PROVIDERS TAB */}
            {activeTab === "PROVIDER" && (
              <>
                {filteredProv.length > 0 ? (
                  filteredProv.map((p) => <AppleProviderCard key={p.id} p={p} nav={nav} toggleBookmark={toggleBookmark} isGuest={isGuest} />)
                ) : (
                  <AppleEmptyState
                    icon={Wrench}
                    title={searchQuery || filterType !== "ALL" ? "No matching saved providers" : "No service pros saved yet"}
                    text={
                      searchQuery || filterType !== "ALL"
                        ? "Try adjusting your filters to find saved service experts."
                        : "Bookmark trusted neighborhood electricians, plumbers, trainers, and freelancers."
                    }
                    actionLabel="Find Service Pros"
                    onAction={() => nav("/explore")}
                  />
                )}
              </>
            )}

            {/* REQUESTS TAB */}
            {activeTab === "REQUEST" && (
              <>
                {filteredReq.length > 0 ? (
                  filteredReq.map((r) => <AppleRequestCard key={r.id} r={r} nav={nav} toggleBookmark={toggleBookmark} isGuest={isGuest} />)
                ) : (
                  <AppleEmptyState
                    icon={FileText}
                    title={searchQuery || filterType !== "ALL" ? "No matching saved requests" : "No saved requests"}
                    text={
                      searchQuery || filterType !== "ALL"
                        ? "Clear your search to view all saved community asks."
                        : "Save community asks and local jobs you want to submit proposals for later."
                    }
                    actionLabel="Browse Community Asks"
                    onAction={() => nav("/requests")}
                  />
                )}
              </>
            )}

            {/* FOLLOWING TAB */}
            {activeTab === "FOLLOWING" && (
              <>
                {counts.FOLLOWING > 0 ? (
                  <div className="col gap-20">
                    {/* Followed Members */}
                    {followUsers.length > 0 && (
                      <div className="col gap-10">
                        <div className="row space-between center-v">
                          <span className="bold small text-muted" style={{ textTransform: "uppercase", letterSpacing: "0.6px", fontSize: 11.5 }}>
                            Local Neighbors ({followUsers.length})
                          </span>
                        </div>
                        <div className="col gap-10">
                          {followUsers.map((u: any) => (
                            <AppleUserFollowCard key={u.id} u={u} nav={nav} toggleFollow={toggleFollow} />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Followed Shops */}
                    {followBiz.length > 0 && (
                      <div className="col gap-10">
                        <div className="row space-between center-v">
                          <span className="bold small text-muted" style={{ textTransform: "uppercase", letterSpacing: "0.6px", fontSize: 11.5 }}>
                            Followed Shops ({followBiz.length})
                          </span>
                        </div>
                        <div className="col gap-10">
                          {followBiz.map((b) => (
                            <AppleBusinessCard key={b.id} b={b} nav={nav} toggleBookmark={toggleBookmark} isGuest={isGuest} isFollowView toggleFollow={toggleFollow} />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Followed Providers */}
                    {followProv.length > 0 && (
                      <div className="col gap-10">
                        <div className="row space-between center-v">
                          <span className="bold small text-muted" style={{ textTransform: "uppercase", letterSpacing: "0.6px", fontSize: 11.5 }}>
                            Followed Service Pros ({followProv.length})
                          </span>
                        </div>
                        <div className="col gap-10">
                          {followProv.map((p) => (
                            <AppleProviderCard key={p.id} p={p} nav={nav} toggleBookmark={toggleBookmark} isGuest={isGuest} isFollowView toggleFollow={toggleFollow} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <AppleEmptyState
                    icon={Users}
                    title="Not following anyone yet"
                    text="Follow shops, service providers, and neighbors to get their announcements, stories, and updates first."
                    actionLabel="Discover Neighbors"
                    onAction={() => nav("/explore")}
                  />
                )}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

/* ---------------- Apple Business Card ---------------- */
function AppleBusinessCard({
  b,
  nav,
  toggleBookmark,
  isGuest,
  isFollowView,
  toggleFollow,
}: {
  b: Business;
  nav: any;
  toggleBookmark: any;
  isGuest: boolean;
  isFollowView?: boolean;
  toggleFollow?: any;
}) {
  const evalRes = evaluateProviderAvailability(b.hours, b.isAvailableNow, b.availableUntil);

  return (
    <div className="apple-card" onClick={() => nav(`/business/${b.id}`)}>
      <div style={{ position: "relative" }}>
        <img
          src={b.coverImage}
          alt={b.name}
          style={{ width: "100%", height: 135, objectFit: "cover" }}
          loading="lazy"
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(to top, rgba(0,0,0,0.65) 0%, transparent 60%)",
          }}
        />

        {/* Status Pills */}
        <div style={{ position: "absolute", top: 10, left: 10 }} className="row gap-6">
          <span
            className="apple-badge-pill"
            style={{
              background: evalRes.isOpenNow ? "rgba(22, 163, 74, 0.9)" : "rgba(100, 116, 139, 0.9)",
              color: "#ffffff",
              backdropFilter: "blur(8px)",
            }}
          >
            {evalRes.isOpenNow ? "● Open Now" : "Closed"}
          </span>
          {b.distanceKm !== undefined && (
            <span
              className="apple-badge-pill"
              style={{
                background: "rgba(0, 0, 0, 0.6)",
                color: "#ffffff",
                backdropFilter: "blur(8px)",
              }}
            >
              📍 {distanceLabel(b.distanceKm)}
            </span>
          )}
        </div>

        {/* Save / Unsave Action */}
        {!isGuest && (
          <button
            type="button"
            className="icon-btn"
            style={{
              position: "absolute",
              top: 10,
              right: 10,
              width: 34,
              height: 34,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.92)",
              backdropFilter: "blur(8px)",
              boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
              border: "none",
            }}
            onClick={(e) => {
              e.stopPropagation();
              haptics.selection();
              if (isFollowView && toggleFollow) {
                toggleFollow("BUSINESS", b.id, b.name);
              } else {
                toggleBookmark("BUSINESS", b.id);
              }
            }}
            aria-label="Toggle Save"
          >
            {isFollowView ? (
              <UserCheck size={16} color="var(--brand-700)" />
            ) : (
              <Heart size={16} fill="var(--red-500)" color="var(--red-500)" />
            )}
          </button>
        )}

        {/* Title overlay */}
        <div style={{ position: "absolute", bottom: 10, left: 12, right: 12, color: "#fff" }}>
          <div className="row gap-6 center-v">
            <span className="bold ellipsis" style={{ fontSize: 16.5, letterSpacing: "-0.3px", textShadow: "0 1px 3px rgba(0,0,0,0.4)" }}>
              {b.name}
            </span>
            {b.isVerified && <BadgeCheck size={17} color="var(--brand-600)" />}
          </div>
        </div>
      </div>

      <div style={{ padding: "12px 14px" }} className="col gap-8">
        <div className="row space-between center-v tiny muted">
          <span className="bold" style={{ color: "var(--brand-700)", fontSize: 12.5 }}>
            {b.categoryName || "Shop"} {b.subCategory ? `• ${b.subCategory}` : ""}
          </span>
          <div className="row gap-4 center-v">
            <Star size={13} color="var(--amber-500)" />
            <span className="bold" style={{ color: "var(--ink-900)" }}>{b.ratingAvg || "4.8"}</span>
          </div>
        </div>

        {b.offerText && (
          <div className="row gap-4 center-v tiny bold" style={{ color: "var(--pink-600)", background: "var(--pink-50)", padding: "4px 8px", borderRadius: 8 }}>
            <Sparkles size={13} color="var(--pink-600)" />
            <span className="ellipsis">{b.offerText}</span>
          </div>
        )}

        <div className="row space-between center-v" style={{ marginTop: 4 }}>
          <span className="tiny muted ellipsis" style={{ maxWidth: "60%" }}>
            📍 {b.city || "Neighborhood Shop"}
          </span>

          <div className="row gap-8">
            <button
              type="button"
              className="btn btn-sm"
              style={{
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 700,
                padding: "6px 14px",
                background: "var(--brand-700)",
                color: "#ffffff",
                border: "none",
              }}
              onClick={(e) => {
                e.stopPropagation();
                nav(`/business/${b.id}`);
              }}
            >
              View Shop
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Apple Provider Card ---------------- */
function AppleProviderCard({
  p,
  nav,
  toggleBookmark,
  isGuest,
  isFollowView,
  toggleFollow,
}: {
  p: Provider;
  nav: any;
  toggleBookmark: any;
  isGuest: boolean;
  isFollowView?: boolean;
  toggleFollow?: any;
}) {
  const evalRes = evaluateProviderAvailability(p.availabilityNote, p.isAvailableNow, p.availableUntil);

  return (
    <div className="apple-card" style={{ padding: 14 }} onClick={() => nav(`/provider/${p.id}`)}>
      <div className="row gap-12 center-v">
        <div style={{ position: "relative" }}>
          <SafeImg
            src={p.avatar}
            alt={p.displayName}
            variant="avatar"
            style={{ width: 58, height: 58, borderRadius: "50%", objectFit: "cover" }}
          />
          <span
            style={{
              position: "absolute",
              bottom: 2,
              right: 2,
              width: 14,
              height: 14,
              borderRadius: "50%",
              background: evalRes.isOpenNow ? "var(--green-500)" : "var(--ink-400)",
              border: "2.5px solid #ffffff",
            }}
          />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row gap-6 center-v">
            <span className="bold ellipsis" style={{ fontSize: 16, color: "var(--ink-900)" }}>
              {p.displayName}
            </span>
            {p.isVerified && <BadgeCheck size={16} color="var(--brand-600)" />}
          </div>

          <div className="tiny bold" style={{ color: "var(--brand-700)", marginTop: 2 }}>
            {p.categoryName || "Service Pro"} {p.subCategory ? `• ${p.subCategory}` : ""}
          </div>

          <div className="row gap-10 center-v tiny muted" style={{ marginTop: 4 }}>
            <span className="row gap-4 center-v">
              <Star size={12} color="var(--amber-500)" />
              <strong style={{ color: "var(--ink-900)" }}>{p.ratingAvg || "4.9"}</strong> ({p.ratingCount || 12})
            </span>
            {p.distanceKm !== undefined && (
              <span>📍 {distanceLabel(p.distanceKm)}</span>
            )}
          </div>
        </div>

        {!isGuest && (
          <button
            type="button"
            className="icon-btn"
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "var(--brand-50)",
              border: "none",
            }}
            onClick={(e) => {
              e.stopPropagation();
              haptics.selection();
              if (isFollowView && toggleFollow) {
                toggleFollow("PROVIDER", p.id, p.displayName);
              } else {
                toggleBookmark("PROVIDER", p.id);
              }
            }}
            aria-label="Remove"
          >
            {isFollowView ? (
              <UserCheck size={16} color="var(--brand-700)" />
            ) : (
              <Heart size={16} fill="var(--red-500)" color="var(--red-500)" />
            )}
          </button>
        )}
      </div>

      <div className="row space-between center-v" style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--line)" }}>
        <div className="tiny bold" style={{ color: "var(--ink-900)" }}>
          {p.startingPrice ? `From ${inr(p.startingPrice)}` : "Custom quote"}
        </div>

        <button
          type="button"
          className="btn btn-sm"
          style={{
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 700,
            padding: "6px 14px",
            background: "var(--brand-700)",
            color: "#ffffff",
            border: "none",
          }}
          onClick={(e) => {
            e.stopPropagation();
            nav(`/provider/${p.id}`);
          }}
        >
          Book Now
        </button>
      </div>
    </div>
  );
}

/* ---------------- Apple Request Card ---------------- */
function AppleRequestCard({ r, nav, toggleBookmark, isGuest }: { r: RequestPost; nav: any; toggleBookmark: any; isGuest: boolean }) {
  return (
    <div className="apple-card" style={{ padding: 14 }} onClick={() => nav(`/request/${r.id}`)}>
      <div className="row space-between center-v">
        <span className="apple-badge-pill" style={{ background: "var(--brand-100)", color: "var(--brand-700)" }}>
          {r.categoryName || "Community Ask"}
        </span>
        <div className="row gap-8 center-v">
          {r.budgetMax && (
            <span className="bold small" style={{ color: "var(--green-600)", fontSize: 13.5 }}>
              Budget: {inr(r.budgetMax)}
            </span>
          )}
          {!isGuest && (
            <button
              type="button"
              className="icon-btn"
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: "var(--red-50)",
                border: "none",
              }}
              onClick={(e) => {
                e.stopPropagation();
                haptics.selection();
                toggleBookmark("REQUEST", r.id);
              }}
              aria-label="Remove bookmark"
            >
              <Heart size={15} fill="var(--red-500)" color="var(--red-500)" />
            </button>
          )}
        </div>
      </div>

      <h3 className="bold" style={{ fontSize: 15.5, margin: "8px 0 4px 0", color: "var(--ink-900)" }}>
        {r.title}
      </h3>

      <p className="tiny muted ellipsis-2" style={{ margin: 0, lineHeight: 1.4 }}>
        {r.description}
      </p>

      <div className="row space-between center-v" style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--line)" }}>
        <span className="tiny muted">
          📍 {distanceLabel(r.distanceKm)} {r.requesterName ? `• ${r.requesterName}` : ""}
        </span>

        <button
          type="button"
          className="btn btn-sm"
          style={{
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 700,
            padding: "6px 14px",
            background: "var(--brand-700)",
            color: "#ffffff",
            border: "none",
          }}
          onClick={(e) => {
            e.stopPropagation();
            nav(`/request/${r.id}`);
          }}
        >
          View Ask
        </button>
      </div>
    </div>
  );
}

/* ---------------- Apple User Follow Card ---------------- */
function AppleUserFollowCard({ u, nav, toggleFollow }: { u: any; nav: any; toggleFollow: any }) {
  return (
    <div className="apple-card" style={{ padding: 14 }} onClick={() => nav(`/u/${u.id}`)}>
      <div className="row space-between center-v">
        <div className="row gap-12 center-v">
          <SafeImg
            src={u.avatar}
            variant="avatar"
            style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover" }}
            onClick={(e) => {
              e.stopPropagation();
              openProfile(u.id, "USER", { name: u.name, avatar: u.avatar });
            }}
          />
          <div>
            <div className="bold small" style={{ color: "var(--ink-900)" }}>{u.name}</div>
            <div className="tiny muted row gap-4 center-v" style={{ marginTop: 2 }}>
              <Star size={11} color="var(--amber-500)" />
              <span>{u.ratingAvg || "5.0"} • 📍 {u.area || "Local Member"}</span>
            </div>
          </div>
        </div>

        <div className="row gap-8 center-v">
          <button
            type="button"
            className="icon-btn"
            style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--brand-50)", border: "none" }}
            onClick={(e) => {
              e.stopPropagation();
              nav(`/chat/${u.id}`);
            }}
            aria-label="Message"
          >
            <MessageCircle size={17} color="var(--brand-700)" />
          </button>

          <button
            type="button"
            className="btn btn-sm row gap-4 center-v"
            style={{
              borderRadius: 999,
              padding: "6px 12px",
              fontSize: 12,
              fontWeight: 700,
              background: "var(--brand-100)",
              color: "var(--brand-700)",
              border: "none",
            }}
            onClick={(e) => {
              e.stopPropagation();
              haptics.selection();
              toggleFollow("USER", u.id, u.name);
            }}
          >
            <UserCheck size={14} /> Following
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Apple Empty State Component ---------------- */
function AppleEmptyState({
  icon: Icon,
  title,
  text,
  actionLabel,
  onAction,
}: {
  icon: any;
  title: string;
  text: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div
      className="apple-card col center"
      style={{
        padding: "36px 20px",
        textAlign: "center",
        background: "#ffffff",
      }}
    >
      <div className="apple-empty-glow">
        <Icon size={34} color="var(--brand-600)" />
      </div>

      <h2 className="bold" style={{ fontSize: 18, marginTop: 16, color: "var(--ink-900)", letterSpacing: "-0.3px" }}>
        {title}
      </h2>

      <p className="muted small" style={{ maxWidth: 300, marginTop: 6, lineHeight: 1.45 }}>
        {text}
      </p>

      <button
        type="button"
        className="btn"
        style={{
          marginTop: 20,
          borderRadius: 999,
          padding: "10px 24px",
          fontWeight: 700,
          fontSize: 13.5,
          background: "var(--brand-700)",
          color: "#ffffff",
          boxShadow: "var(--shadow-brand)",
          border: "none",
        }}
        onClick={onAction}
      >
        {actionLabel}
      </button>
    </div>
  );
}
