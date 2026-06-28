import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AppBar, StarRow, EmptyState, SafeImg, inr } from "@/components/common";
import { Shield, Award, Heart, MessageSquareText, HandshakeIcon, Star, BadgeCheck, Share2, Tag, ThumbsUp, MessageCircle, ChevronRight } from "lucide-react";
import { userService, chatService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { Skeleton, ErrorView } from "@/components/states";
import ShareCard from "@/components/ShareCard";
import { useApp } from "@/store";

const Handshake = HandshakeIcon as any;

const verifyLabels: Record<string, string> = {
  phone: "Phone",
  id: "ID",
  address: "Address",
  business: "Business",
};

type Tab = "overview" | "posts" | "asks" | "quotes" | "reviews";

const TABS: [Tab, string, string][] = [
  ["overview", "Overview", "🏠"],
  ["posts", "Posts", "💬"],
  ["asks", "Asks", "📬"],
  ["quotes", "Quotes", "🏷️"],
  ["reviews", "Reviews", "⭐"],
];

export default function PublicProfile() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { showToast, user } = useApp();
  const { data: u, loading, error, refetch } = useQuery(() => userService.publicProfile(id), [id]);
  const [share, setShare] = useState(false);
  const [chatting, setChatting] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  async function handleStartChat() {
    if (chatting) return;
    if (id === user.id) {
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
          <Skeleton h={14} w="30%" />
          <div className="row gap-8" style={{ marginTop: 4 }}>
            <Skeleton h={32} w={80} r={16} />
            <Skeleton h={32} w={80} r={16} />
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
  const proposalsGiven = u.proposalsGiven ?? [];

  const tabCounts: Record<Tab, number | null> = {
    overview: null,
    posts: posts.length,
    asks: requests.length,
    quotes: proposalsGiven.length,
    reviews: u.reviewsGiven.length,
  };

  return (
    <div className="screen">
      <AppBar
        title="Profile"
        right={
          <button className="icon-btn" onClick={() => setShare(true)} aria-label="Share QR Code">
            <Share2 size={18} />
          </button>
        }
      />
      <div className="screen-scroll">

        {/* ── Hero Header ── */}
        <div
          style={{
            background: "linear-gradient(160deg, var(--brand-600) 0%, var(--brand-800) 100%)",
            padding: "28px 20px 24px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
          }}
        >
          {/* Avatar ring */}
          <div
            style={{
              width: 96,
              height: 96,
              borderRadius: "50%",
              padding: 3,
              background: "linear-gradient(135deg, var(--accent-400), var(--brand-300))",
              boxShadow: "0 8px 28px rgba(109,40,217,0.45)",
              marginBottom: 12,
            }}
          >
            <SafeImg
              src={u.avatar}
              variant="avatar"
              style={{
                width: 90,
                height: 90,
                borderRadius: "50%",
                objectFit: "cover",
                border: "2px solid white",
                display: "block",
              }}
            />
          </div>

          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#fff", letterSpacing: "-0.3px", margin: 0 }}>{u.name}</h1>
          {u.alias && <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.85)", marginTop: 2 }}>@{u.alias}</div>}
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.72)", marginTop: 4 }}>
            📍 {u.area} · Member since {u.memberSince}
          </span>

          <div className="row gap-8" style={{ marginTop: 10 }}>
            <span
              style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                background: "rgba(255,255,255,0.18)", border: "1px solid rgba(255,255,255,0.28)",
                borderRadius: 999, padding: "5px 11px", fontSize: 12, fontWeight: 700, color: "#fff",
                backdropFilter: "blur(6px)",
              }}
            >
              <Star size={12} fill="#fbbf24" stroke="none" />
              {u.ratingAvg} <span style={{ fontWeight: 400, opacity: 0.75 }}>({u.ratingCount})</span>
            </span>
            {u.verifications.length > 0 && (
              <span
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  background: "rgba(255,255,255,0.18)", border: "1px solid rgba(255,255,255,0.28)",
                  borderRadius: 999, padding: "5px 11px", fontSize: 12, fontWeight: 700, color: "#fff",
                  backdropFilter: "blur(6px)",
                }}
              >
                <BadgeCheck size={13} /> Verified
              </span>
            )}
          </div>

          {id !== user.id && (
            <button
              className="btn btn-sm row center gap-8"
              style={{
                marginTop: 16, minWidth: 180,
                background: "rgba(255,255,255,0.18)", backdropFilter: "blur(8px)",
                border: "1.5px solid rgba(255,255,255,0.38)", boxShadow: "none",
                color: "#fff", borderRadius: 14, fontWeight: 700, fontSize: 14,
              }}
              onClick={handleStartChat}
              disabled={chatting}
            >
              <MessageSquareText size={16} />
              {chatting ? "Opening…" : "Message neighbor"}
            </button>
          )}
        </div>

        {/* ── Stats card ── */}
        <div style={{ padding: "12px 16px 0" }}>
          <div
            className="card row"
            style={{
              padding: "14px 8px",
              borderRadius: 18,
              boxShadow: "0 4px 24px rgba(109,40,217,0.13)",
              border: "1px solid var(--brand-100)",
            }}
          >
            <Stat icon={<Handshake size={18} color="#16a34a" />} value={u.helpedCount} label="Helped" color="#16a34a" />
            <Sep />
            <Stat icon={<MessageSquareText size={18} color="#cc4415" />} value={u.requestsCount} label="Requests" color="#cc4415" />
            <Sep />
            <Stat icon={<Tag size={18} color="#3b82f6" />} value={proposalsGiven.length} label="Quotes" color="#3b82f6" />
            <Sep />
            <Stat icon={<Heart size={18} color="#ef4444" />} value={u.vouchCount} label="Vouches" color="#ef4444" />
          </div>
        </div>

        {/* ── Pill Tab Bar ── */}
        <div
          className="row"
          style={{
            marginTop: 14, marginBottom: 2,
            paddingLeft: 12, paddingRight: 12,
            gap: 6, overflowX: "auto", scrollbarWidth: "none",
          }}
        >
          {TABS.map(([t, label, emoji]) => {
            const count = tabCounts[t];
            const isActive = activeTab === t;
            return (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                style={{
                  flexShrink: 0,
                  padding: "7px 14px",
                  borderRadius: 999,
                  fontSize: 12.5,
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                  transition: "all 0.18s ease",
                  background: isActive
                    ? "linear-gradient(135deg, var(--brand-500), var(--brand-700))"
                    : "var(--surface)",
                  color: isActive ? "#fff" : "var(--ink-600)",
                  border: isActive ? "none" : "1.5px solid var(--ink-200)",
                  boxShadow: isActive ? "0 4px 14px rgba(109,40,217,0.28)" : "none",
                }}
              >
                {emoji} {label}
                {count !== null && count > 0 && (
                  <span
                    style={{
                      marginLeft: 5, fontSize: 11,
                      background: isActive ? "rgba(255,255,255,0.25)" : "var(--brand-100)",
                      color: isActive ? "#fff" : "var(--brand-700)",
                      borderRadius: 999, padding: "1px 6px", fontWeight: 700,
                    }}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── OVERVIEW TAB ── */}
        {activeTab === "overview" && (
          <div className="col gap-14 page-pad" style={{ paddingTop: 14 }}>
            {u.verifications.length > 0 && (
              <SectionBox title="Verified Trust" icon={<Shield size={14} color="var(--green-600)" />}>
                <div className="row wrap gap-8">
                  {u.verifications.map((v) => (
                    <span key={v} className="badge badge-green" style={{ padding: "6px 12px", fontSize: 12, gap: 5 }}>
                      <BadgeCheck size={12} /> {verifyLabels[v]}
                    </span>
                  ))}
                </div>
              </SectionBox>
            )}
            {u.badges.length > 0 && (
              <SectionBox title="Badges & Achievements" icon={<Award size={14} color="var(--brand-600)" />}>
                <div className="row wrap gap-8">
                  {u.badges.map((b) => (
                    <span key={b} className="badge badge-purple" style={{ padding: "7px 13px", fontSize: 12 }}>{b}</span>
                  ))}
                </div>
              </SectionBox>
            )}
            <SectionBox title="Recent Activity" icon={null}>
              <div className="col gap-10">
                {posts.length > 0 && (
                  <ActivityCard label="Community Post" labelColor="var(--brand-700)" emoji="💬"
                    date={posts[0].date} body={posts[0].title || posts[0].body.slice(0, 60)} onClick={() => setActiveTab("posts")} />
                )}
                {requests.length > 0 && (
                  <ActivityCard label="Service Request" labelColor="#cc4415" emoji="📬"
                    date={requests[0].date} body={`${requests[0].categoryName || "Help Ask"}: ${requests[0].description.slice(0, 60)}`} onClick={() => setActiveTab("asks")} />
                )}
                {proposalsGiven.length > 0 && (
                  <ActivityCard label="Submitted Quote" labelColor="#3b82f6" emoji="🏷️"
                    date={proposalsGiven[0].date} body={`${inr(proposalsGiven[0].price)} for "${proposalsGiven[0].requestTitle}"`} onClick={() => setActiveTab("quotes")} />
                )}
                {posts.length === 0 && requests.length === 0 && proposalsGiven.length === 0 && (
                  <EmptyState emoji="📜" title="No public activity yet" text="Member activity will appear here." />
                )}
              </div>
            </SectionBox>
          </div>
        )}

        {/* ── POSTS TAB ── */}
        {activeTab === "posts" && (
          <div className="page-pad col gap-10" style={{ paddingTop: 14 }}>
            {posts.length === 0 ? (
              <EmptyState emoji="💬" title="No posts yet" text="This member has not authored any community discussions." />
            ) : (
              posts.map((p) => (
                <div key={p.id} className="card" style={{ padding: "14px 16px" }}>
                  <div className="row between" style={{ marginBottom: 8 }}>
                    <span className="badge badge-blue" style={{ fontSize: 11 }}>{p.type}</span>
                    <span style={{ fontSize: 11, color: "var(--ink-400)", fontWeight: 500 }}>{p.date}</span>
                  </div>
                  {p.title && <div className="bold small" style={{ marginBottom: 4, lineHeight: 1.35 }}>{p.title}</div>}
                  <p className="small clamp-2" style={{ lineHeight: 1.5, color: "var(--ink-700)", margin: 0 }}>{p.body}</p>
                  <div className="row gap-14" style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--line)", fontSize: 12, color: "var(--ink-500)" }}>
                    <span className="row gap-4"><ThumbsUp size={13} /> {p.likesCount} likes</span>
                    <span className="row gap-4"><MessageCircle size={13} /> {p.commentsCount} comments</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── ASKS TAB ── */}
        {activeTab === "asks" && (
          <div className="page-pad col gap-10" style={{ paddingTop: 14 }}>
            {requests.length === 0 ? (
              <EmptyState emoji="📬" title="No requests posted" text="This member has not posted any public service requests." />
            ) : (
              requests.map((r) => (
                <div key={r.id} className="card" style={{ padding: "14px 16px", cursor: "pointer" }} onClick={() => nav(`/request/${r.id}`)}>
                  <div className="row between" style={{ marginBottom: 6 }}>
                    <span className="semi small" style={{ color: "var(--brand-700)" }}>{r.categoryName || "Help Needed"}</span>
                    <span className={`badge ${r.status === "OPEN" ? "badge-green" : "badge-gray"}`} style={{ fontSize: 11 }}>{r.status}</span>
                  </div>
                  <p className="small clamp-2" style={{ lineHeight: 1.45, color: "var(--ink-800)", margin: 0 }}>{r.description}</p>
                  <div className="row between" style={{ marginTop: 10, fontSize: 12 }}>
                    {r.budget ? <span className="semi" style={{ color: "var(--green-600)" }}>Budget: {inr(r.budget)}</span> : <span className="muted">Open budget</span>}
                    <span style={{ fontSize: 11, color: "var(--ink-400)" }}>{r.date}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── QUOTES TAB ── */}
        {activeTab === "quotes" && (
          <div className="page-pad col gap-10" style={{ paddingTop: 14 }}>
            {proposalsGiven.length === 0 ? (
              <EmptyState emoji="🏷️" title="No quotes given" text="This member has not submitted quotes on public requests." />
            ) : (
              proposalsGiven.map((q) => (
                <div key={q.id} className="card" style={{ padding: "14px 16px", cursor: "pointer" }} onClick={() => nav(`/request/${q.requestId}`)}>
                  <div className="row between" style={{ marginBottom: 6 }}>
                    <span className="semi small ellipsis" style={{ maxWidth: "65%", color: "var(--ink-800)" }}>For: {q.requestTitle}</span>
                    <span className="bold" style={{ color: "var(--green-600)", fontSize: 15 }}>{inr(q.price)}</span>
                  </div>
                  {q.note && (
                    <p className="tiny muted" style={{ margin: "6px 0 0", background: "var(--ink-50)", border: "1px solid var(--ink-100)", padding: "8px 10px", borderRadius: 10, lineHeight: 1.5, fontStyle: "italic" }}>
                      "{q.note}"
                    </p>
                  )}
                  <div className="row between" style={{ marginTop: 10, fontSize: 11, color: "var(--ink-400)" }}>
                    <span>Submitted quote</span><span>{q.date}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── REVIEWS TAB ── */}
        {activeTab === "reviews" && (
          <div className="page-pad col gap-10" style={{ paddingTop: 14 }}>
            {u.reviewsGiven.length === 0 ? (
              <EmptyState emoji="📝" title="No reviews yet" text="This member has not written reviews for local places." />
            ) : (
              u.reviewsGiven.map((r) => (
                <div key={r.id} className="card" style={{ padding: "14px 16px" }}>
                  <div className="row between" style={{ marginBottom: 4 }}>
                    <span className="semi small">{r.target}</span>
                    <span style={{ fontSize: 11, color: "var(--ink-400)" }}>{r.date}</span>
                  </div>
                  <StarRow value={r.rating} size={13} />
                  <p className="small" style={{ marginTop: 8, lineHeight: 1.5, color: "var(--ink-800)", margin: "8px 0 0" }}>{r.comment}</p>
                </div>
              ))
            )}
          </div>
        )}

        <div style={{ height: 28 }} />
      </div>

      {share && (
        <ShareCard
          title={u.name}
          subtitle={`Member since ${u.memberSince} • ${u.area}`}
          image={u.avatar}
          url={window.location.origin + "/u/" + u.id}
          onClose={() => setShare(false)}
        />
      )}
    </div>
  );
}

function Stat({ icon, value, label, color }: { icon: React.ReactNode; value: number; label: string; color: string }) {
  return (
    <div className="grow col center" style={{ gap: 3 }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", background: `${color}18`, marginBottom: 2 }}>
        {icon}
      </div>
      <span style={{ fontSize: 17, fontWeight: 800, color: "var(--ink-900)", lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: 10, color: "var(--ink-500)", fontWeight: 600, letterSpacing: "0.2px" }}>{label}</span>
    </div>
  );
}

function Sep() {
  return <div style={{ width: 1, alignSelf: "stretch", background: "var(--line)", margin: "6px 0" }} />;
}

function SectionBox({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      {title && (
        <div className="row gap-6" style={{ marginBottom: 10, fontSize: 12, fontWeight: 700, color: "var(--ink-500)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
          {icon}{title}
        </div>
      )}
      {children}
    </div>
  );
}

function ActivityCard({ label, labelColor, emoji, date, body, onClick }: { label: string; labelColor: string; emoji: string; date: string; body: string; onClick: () => void }) {
  return (
    <div className="card" style={{ padding: "12px 14px", cursor: "pointer" }} onClick={onClick}>
      <div className="row between" style={{ marginBottom: 5 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: labelColor }}>{emoji} {label}</span>
        <span style={{ fontSize: 11, color: "var(--ink-400)" }}>{date}</span>
      </div>
      <div className="row between" style={{ gap: 8 }}>
        <span className="small clamp-2" style={{ color: "var(--ink-800)", lineHeight: 1.4, flex: 1 }}>{body}</span>
        <ChevronRight size={15} color="var(--ink-300)" style={{ flexShrink: 0 }} />
      </div>
    </div>
  );
}
