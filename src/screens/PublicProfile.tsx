import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AppBar, StarRow, EmptyState, SafeImg } from "@/components/common";
import { Phone, Shield, Award, Heart, MessageSquareText, HandshakeIcon, Star, BadgeCheck, Share2 } from "lucide-react";
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

export default function PublicProfile() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { showToast, user } = useApp();
  const { data: u, loading, error, refetch } = useQuery(() => userService.publicProfile(id), [id]);
  const [share, setShare] = useState(false);
  const [chatting, setChatting] = useState(false);

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
        <div className="col center page-pad" style={{ paddingTop: 20, gap: 12 }}>
          <Skeleton h={88} w={88} r={44} />
          <Skeleton h={22} w="50%" />
          <Skeleton h={14} w="40%" />
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
        <div className="col center page-pad" style={{ paddingTop: 20, textAlign: "center" }}>
          <SafeImg src={u.avatar} variant="avatar" className="avatar" style={{ width: 88, height: 88, border: "3px solid var(--brand-100)" }} />
          <h1 className="bold" style={{ fontSize: 22, marginTop: 12 }}>{u.name}</h1>
          <span className="small muted">📍 {u.area} • Member since {u.memberSince}</span>
          <div className="row gap-8" style={{ marginTop: 10 }}>
            <span className="badge badge-amber"><Star size={11} fill="#f59e0b" strokeWidth={0} /> {u.ratingAvg} ({u.ratingCount})</span>
            {u.verifications.length > 0 && <span className="badge badge-green"><BadgeCheck size={11} /> Verified</span>}
          </div>
          {id !== user.id && (
            <button
              className="btn btn-primary btn-sm row center gap-8"
              style={{ marginTop: 14, minWidth: 160 }}
              onClick={handleStartChat}
              disabled={chatting}
            >
              <MessageSquareText size={16} />
              {chatting ? "Opening chat..." : "Message neighbor"}
            </button>
          )}
        </div>

        {/* stats */}
        <div className="page-pad" style={{ paddingTop: 6 }}>
          <div className="card row" style={{ padding: 14 }}>
            <Stat icon={<Handshake size={18} color="#16a34a" />} value={u.helpedCount} label="Helped" />
            <Sep />
            <Stat icon={<MessageSquareText size={18} color="#cc4415" />} value={u.requestsCount} label="Requests" />
            <Sep />
            <Stat icon={<Heart size={18} color="#ef4444" />} value={u.vouchCount} label="Vouches" />
          </div>
        </div>

        {/* verification chips */}
        <div className="page-pad" style={{ paddingTop: 6 }}>
          <div className="small semi muted row gap-6" style={{ marginBottom: 8 }}><Shield size={14} /> Verified</div>
          <div className="row wrap gap-8">
            {u.verifications.map((v) => (
              <span key={v} className="badge badge-green" style={{ padding: "7px 12px" }}><BadgeCheck size={13} /> {verifyLabels[v]} ✓</span>
            ))}
          </div>
        </div>

        {/* badges */}
        <div className="page-pad" style={{ paddingTop: 6 }}>
          <div className="small semi muted row gap-6" style={{ marginBottom: 8 }}><Award size={14} /> Badges</div>
          <div className="row wrap gap-8">
            {u.badges.map((b) => (
              <span key={b} className="badge badge-purple" style={{ padding: "8px 13px", fontSize: 12 }}>{b}</span>
            ))}
          </div>
        </div>

        {/* reviews given */}
        <div className="page-pad" style={{ paddingTop: 10 }}>
          <div className="small semi muted" style={{ marginBottom: 10 }}>Reviews by {u.name.split(" ")[0]}</div>
          {u.reviewsGiven.length === 0 ? (
            <EmptyState emoji="📝" title="No reviews yet" text="" />
          ) : (
            <div className="col gap-12">
              {u.reviewsGiven.map((r) => (
                <div key={r.id} className="card" style={{ padding: 13 }}>
                  <div className="row between"><span className="semi small">{r.target}</span><span className="tiny muted">{r.date}</span></div>
                  <StarRow value={r.rating} size={12} />
                  <p className="small" style={{ marginTop: 4, lineHeight: 1.45 }}>{r.comment}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ height: 24 }} />
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

function Stat({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="grow col center" style={{ gap: 3 }}>
      {icon}
      <span className="bold" style={{ fontSize: 18 }}>{value}</span>
      <span className="tiny muted">{label}</span>
    </div>
  );
}
function Sep() { return <div style={{ width: 1, alignSelf: "stretch", background: "var(--line)" }} />; }
