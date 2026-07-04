import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AppBar, EmptyState, SafeImg } from "@/components/common";
import {
  Shield,
  Award,
  MessageSquareText,
  Star,
  BadgeCheck,
  Share2,
  ThumbsUp,
  MessageCircle,
  UserPlus,
  UserCheck,
  Lock,
  MapPin,
  Loader,
} from "lucide-react";
import { userService, chatService, socialService, locationService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { Skeleton, ErrorView } from "@/components/states";
import ShareCard from "@/components/ShareCard";
import { useApp } from "@/store";
import { firstName } from "@/lib/publicName";

const verifyLabels: Record<string, string> = {
  phone: "Phone",
  id: "ID",
  address: "Address",
  business: "Business",
};

type Tab = "posts" | "asks" | "badges";

const TABS: [Tab, string, string][] = [
  ["posts", "Posts", "💬"],
  ["asks", "Asks", "📬"],
  ["badges", "Badges", "🏆"],
];

export default function PublicProfile() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { showToast, user, isFollowing, toggleFollow } = useApp();
  const { data: u, loading, error, refetch } = useQuery(() => userService.publicProfile(id), [id]);
  const { data: followersData } = useQuery(() => id ? socialService.followers(id) : Promise.resolve([]), [id]);
  const followersCount = followersData?.length ?? 0;
  const [share, setShare] = useState(false);
  const [chatting, setChatting] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("posts");
  const [hiddenPosts, setHiddenPosts] = useState<string[]>(() => {
    try {
      const s = localStorage.getItem("stryt_hidden_posts");
      return s ? JSON.parse(s) : [];
    } catch {
      return [];
    }
  });

  const following = isFollowing("USER", id);
  const isSelf = user.id === id;

  // distanceKm is computed server-side from the viewer's own coordinates —
  // this page never receives another user's exact coordinates, so there's
  // no "get directions to their exact address" feature here by design (see
  // ISS-009). A ballpark distance is consistent with how distance is shown
  // everywhere else in the app.
  const distanceText = !isSelf && u?.distanceKm !== undefined ? `${u.distanceKm.toFixed(1)} km away` : null;

  function toggleHidePost(postId: string) {
    const isHidden = hiddenPosts.includes(postId);
    const updated = isHidden ? hiddenPosts.filter((x) => x !== postId) : [...hiddenPosts, postId];
    setHiddenPosts(updated);
    try {
      localStorage.setItem("stryt_hidden_posts", JSON.stringify(updated));
    } catch {}
    showToast(isHidden ? "Post is now visible on public profile" : "Post hidden from public profile");
  }

  async function handleStartChat() {
    if (chatting) return;
    if (isSelf) {
      showToast("You cannot message yourself");
      return;
    }
    setChatting(true);
    try {
      const conv = await chatService.getOrCreate(id);
      nav(`/chat/${conv.id}`);
    } catch (err: any) {
      showToast(err.message || "Couldn't start chat");
    } finally {
      setChatting(false);
    }
  }

  if (loading) {
    return (
      <div className="screen">
        <AppBar title="Profile" />
        <div className="col center page-pad" style={{ paddingTop: 32, gap: 14 }}>
          <Skeleton h={96} w={96} r={48} />
          <Skeleton h={22} w="55%" />
          <Skeleton h={14} w="40%" />
          <div className="row gap-8" style={{ marginTop: 12 }}>
            <Skeleton h={40} w={120} r={20} />
            <Skeleton h={40} w={120} r={20} />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="screen">
        <AppBar title="Profile" />
        <ErrorView error={error} onRetry={refetch} />
      </div>
    );
  }

  if (!u) {
    return (
      <div className="screen">
        <AppBar title="Profile" />
        <EmptyState emoji="👤" title="Profile not found" text="This member may no longer be available." />
      </div>
    );
  }

  const posts = u.posts ?? [];
  const requests = u.requests ?? [];

  const tabCounts: Record<Tab, number | null> = {
    posts: posts.length,
    asks: requests.length,
    badges: u.badges.length,
  };

  return (
    <div className="screen" style={{ background: "var(--bg)" }}>
      <AppBar
        title={firstName(u.name)}
        right={
          <button className="icon-btn" onClick={() => setShare(true)} aria-label="Share QR Code">
            <Share2 size={18} />
          </button>
        }
      />
      <div className="screen-scroll">
        {/* ── Instagram / Snapchat Style Hero Header ── */}
        <div
          style={{
            background: "linear-gradient(160deg, var(--brand-700) 0%, #290d4f 100%)",
            padding: "24px 20px 20px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            color: "#fff",
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
          }}
        >
          {/* Avatar Ring */}
          <div
            style={{
              position: "relative",
              width: 92,
              height: 92,
              borderRadius: "50%",
              padding: 3,
              background: "linear-gradient(135deg, var(--amber-500), #ec4899, var(--brand-500))",
              boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
              marginBottom: 12,
            }}
          >
            <SafeImg
              src={u.avatar}
              variant="avatar"
              style={{
                width: 86,
                height: 86,
                borderRadius: "50%",
                objectFit: "cover",
                border: "2.5px solid #fff",
                display: "block",
              }}
            />
          </div>

          <h1 style={{ fontSize: 22, fontWeight: 900, color: "#fff", letterSpacing: "-0.4px", margin: 0 }}>
            {firstName(u.name)}
          </h1>

          <div className="row center gap-6" style={{ marginTop: 6, fontSize: 12, color: "rgba(255,255,255,0.75)", flexWrap: "wrap" }}>
            {(isSelf || u.showCityPublicly !== false) && (
              <>
                <span>📍 {u.area || "Neighborhood Member"}{distanceText && ` • ${distanceText}`}</span>
                <span>•</span>
              </>
            )}
            <span>Member since {u.memberSince}</span>
          </div>
          {u.phone && (isSelf || u.showPhonePublicly !== false) && (
            <a href={`tel:${u.phone}`} style={{ marginTop: 4, fontSize: 12.5, fontWeight: 700, color: "#fff", opacity: 0.9 }}>
              📞 {u.phone}
            </a>
          )}
          {u.email && (isSelf || u.showEmailPublicly === true) && (
            <a href={`mailto:${u.email}`} style={{ marginTop: 2, fontSize: 12.5, fontWeight: 700, color: "#fff", opacity: 0.9, display: "block" }}>
              ✉️ {u.email}
            </a>
          )}
          {!isSelf && (
            <div>
              <LocationShareControl targetId={u.id} />
            </div>
          )}

          {/* Verification & Rating Badges */}
          <div className="row center gap-8" style={{ marginTop: 10 }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                background: "rgba(255,255,255,0.16)",
                border: "1px solid rgba(255,255,255,0.25)",
                borderRadius: 999,
                padding: "4px 10px",
                fontSize: 12,
                fontWeight: 700,
                color: "#fff",
              }}
            >
              <Star size={12} fill="#fbbf24" stroke="none" />
              {u.ratingCount > 0 ? <>{u.ratingAvg} <span style={{ fontWeight: 400, opacity: 0.75 }}>({u.ratingCount})</span></> : "New"}
            </span>

            {u.verifications.length > 0 && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  background: "rgba(34, 197, 94, 0.25)",
                  border: "1px solid rgba(34, 197, 94, 0.4)",
                  borderRadius: 999,
                  padding: "4px 10px",
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#fff",
                }}
              >
                <BadgeCheck size={13} color="#4ade80" /> Verified
              </span>
            )}
          </div>

          {/* Social Action Buttons */}
          {!isSelf && (
            <div className="row center gap-10" style={{ marginTop: 18, width: "100%", maxWidth: 320 }}>
              {/* Follow / Following Button */}
              <button
                type="button"
                className="btn grow row center gap-6"
                onClick={() => toggleFollow("USER", id, firstName(u.name))}
                style={{
                  padding: "10px 16px",
                  borderRadius: 16,
                  fontWeight: 700,
                  fontSize: 14,
                  background: following ? "rgba(255,255,255,0.2)" : "#fff",
                  color: following ? "#fff" : "var(--brand-900)",
                  border: following ? "1.5px solid rgba(255,255,255,0.4)" : "none",
                  boxShadow: following ? "none" : "0 4px 14px rgba(0,0,0,0.15)",
                  transition: "all 0.2s",
                }}
              >
                {following ? (
                  <>
                    <UserCheck size={16} /> Following
                  </>
                ) : (
                  <>
                    <UserPlus size={16} /> Follow
                  </>
                )}
              </button>

              {/* Message Button */}
              <button
                type="button"
                className="btn grow row center gap-6"
                onClick={handleStartChat}
                disabled={chatting}
                style={{
                  padding: "10px 16px",
                  borderRadius: 16,
                  fontWeight: 700,
                  fontSize: 14,
                  background: "rgba(255,255,255,0.16)",
                  color: "#fff",
                  border: "1.5px solid rgba(255,255,255,0.3)",
                }}
              >
                <MessageSquareText size={16} /> Message
              </button>

              {/* Share QR */}
              <button
                type="button"
                onClick={() => setShare(true)}
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 16,
                  background: "rgba(255,255,255,0.16)",
                  color: "#fff",
                  border: "1.5px solid rgba(255,255,255,0.3)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
                aria-label="Share profile"
              >
                <Share2 size={18} />
              </button>
            </div>
          )}
        </div>

        {/* ── Key Social Stats Row ── */}
        <div style={{ padding: "14px 16px 0" }}>
          <div
            className="card row space-between"
            style={{
              padding: "14px 16px",
              borderRadius: 20,
              background: "#fff",
              boxShadow: "var(--shadow-sm)",
              border: "1px solid var(--ink-200)",
              textAlign: "center",
            }}
          >
            <div className="col center grow">
              <span className="bold" style={{ fontSize: 18, color: "var(--brand-700)" }}>{u.helpedCount}</span>
              <span className="tiny semi muted" style={{ marginTop: 2 }}>Helped</span>
            </div>
            <div style={{ width: 1, height: 28, background: "var(--ink-100)", alignSelf: "center" }} />
            <div className="col center grow">
              <span className="bold" style={{ fontSize: 18, color: "#cc4415" }}>{requests.length}</span>
              <span className="tiny semi muted" style={{ marginTop: 2 }}>Requests</span>
            </div>
            <div style={{ width: 1, height: 28, background: "var(--ink-100)", alignSelf: "center" }} />
            <div className="col center grow">
              <span className="bold" style={{ fontSize: 18, color: "var(--red-500)" }}>{u.vouchCount}</span>
              <span className="tiny semi muted" style={{ marginTop: 2 }}>Vouches</span>
            </div>
            {(isSelf || u.showRatingPublicly !== false) && (
              <>
                <div style={{ width: 1, height: 28, background: "var(--ink-100)", alignSelf: "center" }} />
                <div className="col center grow">
                  <span className="bold" style={{ fontSize: 18, color: "#3b82f6" }}>{u.ratingAvg}★</span>
                  <span className="tiny semi muted" style={{ marginTop: 2 }}>Rating</span>
                </div>
              </>
            )}
            <div style={{ width: 1, height: 28, background: "var(--ink-100)", alignSelf: "center" }} />
            <button
              type="button"
              className="col center grow"
              style={{ background: "none", border: "none", cursor: isSelf ? "pointer" : "default" }}
              onClick={() => { if (isSelf) nav("/followers"); }}
            >
              <span className="bold" style={{ fontSize: 18, color: "var(--green-500)" }}>{followersCount}</span>
              <span className="tiny semi muted" style={{ marginTop: 2 }}>Followers</span>
            </button>
          </div>
        </div>

        {/* ── Pill Content Tabs (Only Posts, Asks, Badges) ── */}
        <div
          className="row"
          style={{
            marginTop: 16,
            marginBottom: 4,
            paddingLeft: 16,
            paddingRight: 16,
            gap: 8,
            overflowX: "auto",
            scrollbarWidth: "none",
          }}
        >
          {TABS.map(([t, label, emoji]) => {
            const count = tabCounts[t];
            const isActive = activeTab === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setActiveTab(t)}
                style={{
                  flex: 1,
                  padding: "8px 16px",
                  borderRadius: 999,
                  fontSize: 13,
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                  transition: "all 0.2s ease",
                  background: isActive ? "var(--brand-700)" : "#fff",
                  color: isActive ? "#fff" : "var(--ink-600)",
                  border: isActive ? "none" : "1.5px solid var(--ink-200)",
                  boxShadow: isActive ? "0 4px 12px rgba(124, 58, 237, 0.25)" : "none",
                  cursor: "pointer",
                  textAlign: "center",
                }}
              >
                {emoji} {label}
                {count !== null && count > 0 && (
                  <span
                    style={{
                      marginLeft: 6,
                      fontSize: 11,
                      background: isActive ? "rgba(255,255,255,0.25)" : "var(--brand-100)",
                      color: isActive ? "#fff" : "var(--brand-700)",
                      borderRadius: 999,
                      padding: "1px 6px",
                      fontWeight: 700,
                    }}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── POSTS TAB ── */}
        {activeTab === "posts" && (
          <div className="page-pad col gap-12" style={{ paddingTop: 12 }}>
            {!isSelf && u.showPostsPublicly === false ? (
              <EmptyState emoji="🔒" title="Posts are private" text="This member has chosen to keep their community posts private." />
            ) : (() => {
              const displayPosts = isSelf ? posts : posts.filter((p) => !hiddenPosts.includes(p.id));
              if (displayPosts.length === 0) {
                return <EmptyState emoji="💬" title="No posts visible" text="No public community posts available." />;
              }
              return displayPosts.map((p) => {
                const isHidden = hiddenPosts.includes(p.id);
                return (
                  <div key={p.id} className="card" style={{ padding: "16px", borderRadius: 18, opacity: isHidden && isSelf ? 0.7 : 1 }}>
                    <div className="row space-between" style={{ marginBottom: 8, alignItems: "center" }}>
                      <div className="row gap-6 center-v">
                        <span className="badge badge-blue" style={{ fontSize: 11 }}>{p.type}</span>
                        {isSelf && (
                          <button
                            type="button"
                            onClick={() => toggleHidePost(p.id)}
                            className={`badge ${isHidden ? "badge-gray" : "badge-purple"}`}
                            style={{ cursor: "pointer", fontSize: 10, padding: "2px 8px" }}
                          >
                            {isHidden ? <><Lock size={10} style={{ marginRight: 3 }} /> Hidden from public</> : <><Lock size={10} style={{ marginRight: 3 }} /> Public</>}
                          </button>
                        )}
                      </div>
                      <span style={{ fontSize: 11, color: "var(--ink-400)", fontWeight: 500 }}>{p.date}</span>
                    </div>
                    {p.title && <div className="bold small" style={{ marginBottom: 6, lineHeight: 1.35, color: "var(--ink-900)" }}>{p.title}</div>}
                    <p className="small clamp-2" style={{ lineHeight: 1.5, color: "var(--ink-700)", margin: 0 }}>{p.body}</p>
                    <div className="row gap-16 space-between" style={{ marginTop: 14, paddingTop: 10, borderTop: "1px solid var(--ink-100)", fontSize: 12, color: "var(--ink-500)", fontWeight: 600 }}>
                      <div className="row gap-16 center-v">
                        <span className="row gap-4 center-v"><ThumbsUp size={14} color="var(--brand-600)" /> {p.likesCount} likes</span>
                        <span className="row gap-4 center-v"><MessageCircle size={14} color="var(--brand-600)" /> {p.commentsCount} comments</span>
                      </div>
                      {isSelf && (
                        <button
                          type="button"
                          onClick={() => toggleHidePost(p.id)}
                          style={{ background: "none", border: "none", color: isHidden ? "var(--brand-700)" : "var(--ink-400)", cursor: "pointer", fontSize: 11, fontWeight: 700 }}
                        >
                          {isHidden ? "Unhide" : "Hide from profile"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        )}

        {/* ── ASKS TAB ── */}
        {activeTab === "asks" && (
          <div className="page-pad col gap-12" style={{ paddingTop: 12 }}>
            {!isSelf && u.showAsksPublicly === false ? (
              <EmptyState emoji="🔒" title="Requests are private" text="This member has chosen to keep their service requests private." />
            ) : requests.length === 0 ? (
              <EmptyState emoji="📬" title="No requests posted" text="This member has not posted any public service requests." />
            ) : (
              requests.map((r) => (
                <div key={r.id} className="card" style={{ padding: "16px", borderRadius: 18, cursor: "pointer" }} onClick={() => nav(`/request/${r.id}`)}>
                  <div className="row space-between" style={{ marginBottom: 6, alignItems: "center" }}>
                    <span className="semi small" style={{ color: "var(--brand-700)" }}>{r.categoryName || "Help Needed"}</span>
                    <span className={`badge ${r.status === "OPEN" ? "badge-green" : "badge-gray"}`} style={{ fontSize: 11 }}>{r.status}</span>
                  </div>
                  <p className="small clamp-2" style={{ lineHeight: 1.45, color: "var(--ink-800)", margin: 0 }}>{r.description}</p>
                  <div className="row space-between" style={{ marginTop: 12, fontSize: 12, alignItems: "center" }}>
                    <span className="bold" style={{ color: "var(--green-600)" }}>{r.budget ? `Budget: ₹${r.budget}` : "Open budget"}</span>
                    <span style={{ fontSize: 11, color: "var(--ink-400)" }}>{r.date}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── BADGES TAB ── */}
        {activeTab === "badges" && (
          <div className="page-pad col gap-12" style={{ paddingTop: 12 }}>
            {!isSelf && u.showBadgesPublicly === false ? (
              <EmptyState emoji="🔒" title="Badges are private" text="This member has chosen to keep their trust badges private." />
            ) : u.badges.length === 0 && u.verifications.length === 0 ? (
              <EmptyState emoji="🏆" title="No badges earned" text="Member achievements will appear here." />
            ) : (
              <div className="col gap-14">
                {u.verifications.length > 0 && (
                  <div className="card" style={{ padding: 16, borderRadius: 18 }}>
                    <div className="semi small" style={{ marginBottom: 10, color: "var(--ink-900)", display: "flex", alignItems: "center", gap: 6 }}>
                      <Shield size={16} color="var(--green-600)" /> Verified Trust Attributes
                    </div>
                    <div className="row wrap gap-8">
                      {u.verifications.map((v) => (
                        <span key={v} className="badge badge-green" style={{ padding: "6px 14px", fontSize: 12, gap: 5 }}>
                          <BadgeCheck size={13} /> {verifyLabels[v]} Verified
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {u.badges.length > 0 && (
                  <div className="card" style={{ padding: 16, borderRadius: 18 }}>
                    <div className="semi small" style={{ marginBottom: 10, color: "var(--ink-900)", display: "flex", alignItems: "center", gap: 6 }}>
                      <Award size={16} color="var(--brand-600)" /> Earned Community Badges
                    </div>
                    <div className="row wrap gap-8">
                      {u.badges.map((b) => (
                        <span key={b} className="badge badge-purple" style={{ padding: "8px 14px", fontSize: 12.5, fontWeight: 700 }}>
                          🏆 {b}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Share QR Modal */}
      {share && (
        <ShareCard
          title={firstName(u.name)}
          subtitle="STRYT Member"
          image={u.avatar}
          meta={`📍 ${u.area || "Neighborhood"} • ⭐ ${u.ratingAvg}`}
          url={window.location.origin + "/u/" + u.id}
          onClose={() => setShare(false)}
        />
      )}
    </div>
  );
}

// Consent-gated exact-location control. Others must request; the owner approves
// (elsewhere), after which "View on map" reveals coordinates. Hidden on own profile.
function LocationShareControl({ targetId }: { targetId: string }) {
  const { showToast } = useApp();
  const [status, setStatus] = useState<"NONE" | "PENDING" | "APPROVED" | "DENIED" | "LOADING">("LOADING");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    locationService.myStatusToward(targetId).then((s) => { if (active) setStatus(s); });
    return () => { active = false; };
  }, [targetId]);

  async function ask() {
    setBusy(true);
    try {
      await locationService.request(targetId);
      setStatus("PENDING");
      showToast("Location request sent");
    } catch {
      showToast("Couldn't send request");
    } finally {
      setBusy(false);
    }
  }

  async function reveal() {
    setBusy(true);
    try {
      const loc = await locationService.getSharedLocation(targetId);
      if (loc) {
        window.open(`https://www.google.com/maps?q=${loc.lat},${loc.lng}`, "_blank", "noopener");
      } else {
        showToast("Location no longer shared");
        setStatus("NONE");
      }
    } catch {
      showToast("Couldn't load location");
    } finally {
      setBusy(false);
    }
  }

  if (status === "LOADING") return null;

  const base: React.CSSProperties = {
    marginTop: 10, display: "inline-flex", alignItems: "center", gap: 6,
    padding: "7px 14px", borderRadius: 999, fontSize: 12.5, fontWeight: 700,
    border: "1px solid rgba(255,255,255,0.35)", cursor: "pointer",
  };

  if (status === "APPROVED") {
    return (
      <button onClick={reveal} disabled={busy} style={{ ...base, background: "rgba(255,255,255,0.9)", color: "var(--brand-700)" }}>
        {busy ? <Loader size={13} className="spin" /> : <MapPin size={13} />} View exact location
      </button>
    );
  }
  if (status === "PENDING") {
    return (
      <span style={{ ...base, background: "rgba(255,255,255,0.16)", color: "#fff", cursor: "default" }}>
        <Loader size={13} /> Location request pending
      </span>
    );
  }
  return (
    <button onClick={ask} disabled={busy} style={{ ...base, background: "rgba(255,255,255,0.16)", color: "#fff" }}>
      {busy ? <Loader size={13} className="spin" /> : <MapPin size={13} />} Request exact location
    </button>
  );
}
