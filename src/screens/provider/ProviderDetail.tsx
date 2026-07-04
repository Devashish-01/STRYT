import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Heart, Share2, Phone, BadgeCheck, MapPin, Clock,
  CheckCircle2, MessageCircle, Flag, Star, ThumbsUp,
  UserPlus, UserCheck, HandshakeIcon, Plus, Zap,
} from "lucide-react";
import { providerService, socialService, communityService } from "@/services";
import { chatService } from "@/services/engagement/chatService";
import ReviewSheet from "@/components/ReviewSheet";
import { useQuery, useQueryWithRealtime } from "@/hooks/useApi";
import { Skeleton, ErrorView } from "@/components/states";
import { Rating, StarRow, EmptyState, SafeImg, inr } from "@/components/common";
import { useApp } from "@/store";
import ReportSheet from "@/components/ReportSheet";
import ShareCard from "@/components/ShareCard";
import { AppointmentSheet } from "@/components/AppointmentSheet";
import { evaluateProviderAvailability } from "@/utils/availability";
import { isMockTarget } from "@/services/engagement/appointmentService";
import { PROVIDER_BADGE_THRESHOLDS } from "@/lib/badges";
import { displayName as safeName } from "@/lib/publicName";
import MiniMap from "@/components/MiniMap";

const Handshake = HandshakeIcon as any;

export default function ProviderDetail() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const {
    user,
    isBookmarked, toggleBookmark, showToast,
    isFollowing, toggleFollow, vouched, toggleVouch, endorsed, toggleEndorse,
  } = useApp();

  const { data: p, loading, error, refetch } = useQuery(() => providerService.get(id, user.lat || undefined, user.lng || undefined), [id, user.lat, user.lng]);
  const { data: reviews, refetch: refetchReviews } = useQueryWithRealtime(() => providerService.reviews(id), "ratings", [id], `ratee_id=eq.${id}`);
  const { data: vouches } = useQueryWithRealtime(() => socialService.vouches(id), "vouches", [id], `provider_id=eq.${id}`);
  const { data: endorsements } = useQueryWithRealtime(() => socialService.endorsements(id), "endorsements", [id], `provider_id=eq.${id}`);
  const { data: availList } = useQuery(() => socialService.availableNow(), []);
  const { data: packages } = useQuery(() => providerService.packages(id), [id]);
  const { data: provPosts } = useQueryWithRealtime(() => communityService.byAuthorRef("provider", id), "community_posts", [id], `author_ref_id=eq.${id}`);

  // Count a profile view once per provider open.
  useEffect(() => {
    providerService.recordView(id).catch(() => {});
  }, [id]);
  const [tab, setTab] = useState<"about" | "posts" | "portfolio" | "reviews">("about");
  const [report, setReport] = useState(false);
  const [share, setShare] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [scheduling, setScheduling] = useState(false);

  if (loading) {
    return (
      <div className="screen">
        <div style={{ background: "linear-gradient(135deg,var(--green-500),#15803d)", padding: "12px 16px 24px" }}>
          <Skeleton h={78} w={78} r={39} />
        </div>
        <div className="page-pad col gap-12" style={{ marginTop: -14 }}>
          <div className="card" style={{ padding: 14 }}><Skeleton h={44} mb={0} /></div>
          <Skeleton h={16} w="80%" />
          <Skeleton h={16} w="60%" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="screen">
        <ErrorView error={error} onRetry={refetch} />
      </div>
    );
  }

  if (!p) {
    return (
      <div className="screen">
        <EmptyState emoji="👤" title="Provider not found" text="This profile may no longer be available." />
      </div>
    );
  }
  const saved = isBookmarked("PROVIDER", p.id);
  const following = isFollowing("PROVIDER", p.id);
  const isOwner = p.userId === user.id;
  const vouchList = vouches ?? [];
  const hasVouched = vouched.includes(p.id);
  const endorseList = endorsements ?? [];
  const avail = (availList ?? []).find((a) => a.providerId === p.id);
  const evalRes = evaluateProviderAvailability(p.availabilityNote, p.isAvailableNow, p.availableUntil);
  const heroPhoto = p.portfolio[0]?.url;

  return (
    <div className="screen" style={{ position: "relative" }}>
      <div className="screen-scroll" style={{ paddingBottom: 90 }}>
        {isMockTarget(id) && (
          <div style={{ padding: "8px 14px", background: "#fff3e8", borderBottom: "1px solid #ffd9b3" }}>
            <span className="tiny" style={{ color: "#b45309", fontWeight: 600 }}>Demo preview — bookings here aren't saved or sent to an owner.</span>
          </div>
        )}
        {/* Header */}
        <div
          style={{
            background: heroPhoto
              ? `linear-gradient(160deg, rgba(22,163,74,0.88), rgba(21,128,61,0.92)), url(${heroPhoto}) center/cover`
              : "linear-gradient(135deg,var(--green-500),#15803d)",
            color: "#fff", padding: "12px 16px 24px",
          }}
        >
          <div className="row between">
            <button className="icon-btn" style={{ background: "rgba(255,255,255,0.18)", color: "#fff" }} onClick={() => nav(-1)}><ArrowLeft size={20} /></button>
            <div className="row gap-8">
              {!isOwner && p.phone && p.showPhonePublicly !== false && (
                <a
                  className="icon-btn"
                  style={{ background: "rgba(255,255,255,0.18)", color: "#fff" }}
                  href={`tel:${p.phone}`}
                  aria-label="Call"
                  onClick={() => providerService.recordInteraction(p.id, "CALL").catch(() => {})}
                >
                  <Phone size={18} />
                </a>
              )}
              <button className="icon-btn" style={{ background: "rgba(255,255,255,0.18)", color: "#fff" }} onClick={() => setShare(true)}><Share2 size={18} /></button>
              <button className="icon-btn" style={{ background: "rgba(255,255,255,0.18)", color: "#fff" }} onClick={() => toggleBookmark("PROVIDER", p.id)}>
                <Heart size={18} fill={saved ? "#fff" : "none"} />
              </button>
            </div>
          </div>
          <div className="row gap-14" style={{ marginTop: 14 }}>
            <SafeImg src={p.avatar} alt={p.displayName} variant="avatar" className="avatar" style={{ width: 78, height: 78, border: "3px solid rgba(255,255,255,0.4)" }} />
            <div className="grow">
              <div className="row gap-6">
                <span className="bold" style={{ fontSize: 20 }}>{safeName(p.displayName, "Local provider")}</span>
                {p.isVerified && <BadgeCheck size={18} color="#fff" />}
              </div>
              <div className="small" style={{ opacity: 0.9 }}>{p.categoryName} • {p.subCategory}</div>
              <div className="row gap-8" style={{ marginTop: 6 }}>
                <span className="badge" style={{ background: "rgba(255,255,255,0.22)", color: "#fff" }}>
                  <Star size={11} fill="#ffd23f" strokeWidth={0} /> {p.ratingCount > 0 ? `${p.ratingAvg} (${p.ratingCount})` : "New"}
                </span>
                {p.isNew && <span className="badge" style={{ background: "#ff8400", color: "#fff" }}>NEW</span>}
                {avail && <span className="badge" style={{ background: "#fff", color: "var(--green-500)" }}>⚡ Free till {avail.availableUntil}</span>}
              </div>
            </div>
          </div>
        </div>

        {/* Stat strip */}
        <div className="page-pad" style={{ marginTop: -14 }}>
          <div className="card row" style={{ padding: 14 }}>
            <Stat value={p.jobsDone.toString()} label="Jobs done" />
            <Sep />
            <Stat value={`${p.serviceRadiusKm} km`} label="Service area" />
            <Sep />
            <Stat value={p.responseTime} label="Responds" />
          </div>
        </div>

        {/* Follow + vouch row */}
        <div className="page-pad row gap-10" style={{ paddingTop: 0 }}>
          <button
            className="btn grow btn-sm"
            style={{ background: following ? "var(--brand-100)" : "var(--ink-50)", color: following ? "var(--brand-700)" : "var(--ink-700)" }}
            onClick={() => toggleFollow("PROVIDER", p.id, p.displayName)}
          >
            {following ? <><UserCheck size={16} /> Following</> : <><UserPlus size={16} /> Follow</>}
          </button>
          <button
            className="btn grow btn-sm"
            style={{ background: hasVouched ? "#e8f7ee" : "var(--ink-50)", color: hasVouched ? "#15803d" : "var(--ink-700)" }}
            onClick={() => toggleVouch(p.id)}
          >
            <ThumbsUp size={15} fill={hasVouched ? "var(--green-500)" : "none"} /> {hasVouched ? "Vouched" : "Vouch"}
          </button>
        </div>

        {/* Tabs */}
        <div className="row page-pad" style={{ paddingTop: 6, paddingBottom: 0, borderBottom: "1px solid var(--line)" }}>
          {([["about", "About"], ["posts", `Posts (${(provPosts ?? []).length})`], ["portfolio", `Work (${p.portfolio.length})`], ["reviews", "Reviews"]] as const).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)} className="semi"
              style={{ flex: 1, padding: "10px 0", fontSize: 14, color: tab === t ? "var(--green-600)" : "var(--ink-500)", borderBottom: tab === t ? "2.5px solid var(--green-600)" : "2.5px solid transparent" }}>
              {label}
            </button>
          ))}
        </div>

        {tab === "about" && (
          <div className="page-pad col gap-14">
            <p className="small" style={{ lineHeight: 1.6 }}>{p.bio}</p>

            {/* Computed badges from real provider data — no extra DB queries */}
            {(() => {
              const responseHrs = parseInt(p.responseTime ?? "99");
              const badges: { label: string; emoji: string }[] = [
                ...(p.isVerified ? [{ label: "Verified", emoji: "✓" }] : []),
                ...(p.ratingAvg >= PROVIDER_BADGE_THRESHOLDS.topRatedMinRating && p.ratingCount >= PROVIDER_BADGE_THRESHOLDS.topRatedMinReviews ? [{ label: "Top Rated", emoji: "⭐" }] : []),
                ...(!isNaN(responseHrs) && responseHrs <= PROVIDER_BADGE_THRESHOLDS.fastResponderMaxHrs ? [{ label: "Fast Responder", emoji: "⚡" }] : []),
                ...(p.jobsDone >= PROVIDER_BADGE_THRESHOLDS.jobsMilestone ? [{ label: `${PROVIDER_BADGE_THRESHOLDS.jobsMilestone}+ Jobs`, emoji: "💼" }] : []),
                ...(p.isNew ? [{ label: "New Provider", emoji: "🌟" }] : []),
              ];
              if (badges.length === 0) return null;
              return (
                <div>
                  <div className="semi small" style={{ marginBottom: 8 }}>Badges</div>
                  <div className="row wrap gap-8">
                    {badges.map((b) => (
                      <span key={b.label} className="badge badge-purple" style={{ padding: "7px 12px" }}>
                        {b.emoji} {b.label}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })()}

            <div>
              <div className="semi small" style={{ marginBottom: 8 }}>Services & skills</div>
              <div className="row wrap gap-8">
                {p.skills.map((s) => (
                  <span key={s} className="row gap-6 badge badge-green" style={{ padding: "7px 12px" }}>
                    <CheckCircle2 size={13} /> {s}
                  </span>
                ))}
              </div>
            </div>

            {/* Service packages */}
            {(packages ?? []).length > 0 && (
              <div>
                <div className="semi small" style={{ marginBottom: 8 }}>Service packages</div>
                <div className="col gap-8">
                  {(packages ?? []).map((pk) => (
                    <div key={pk.id} className="card row gap-12" style={{ padding: 12 }}>
                      <div className="grow">
                        <div className="row gap-6">
                          <span className="semi small">{pk.name}</span>
                          {pk.instantBook && <span className="badge badge-green"><Zap size={10} /> Instant</span>}
                        </div>
                        {(pk.desc || pk.duration) && <div className="tiny muted">{[pk.desc, pk.duration].filter(Boolean).join(" • ")}</div>}
                      </div>
                      <div className="bold small" style={{ color: "var(--green-600)" }}>{inr(pk.price)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Endorsements */}
            {endorseList.length > 0 && (
              <div>
                <div className="semi small" style={{ marginBottom: 8 }}>Endorsed by neighbors</div>
                <div className="col gap-8">
                  {endorseList.map((e) => {
                    const key = `${p.id}:${e.skill}`;
                    const isOn = endorsed.includes(key);
                    const count = e.count + (isOn && !e.endorsed ? 1 : 0) - (!isOn && e.endorsed ? 1 : 0);
                    return (
                      <div key={e.skill} className="row gap-10 card" style={{ padding: "10px 12px" }}>
                        <span className="grow semi small">{e.skill}</span>
                        <span className="tiny muted">{count}</span>
                        <button
                          className="btn btn-sm"
                          style={{ padding: "6px 12px", background: isOn ? "var(--brand-100)" : "var(--ink-50)", color: isOn ? "var(--brand-700)" : "var(--ink-700)" }}
                          onClick={() => toggleEndorse(p.id, e.skill)}
                        >
                          <ThumbsUp size={13} fill={isOn ? "#e5521c" : "none"} /> {isOn ? "Endorsed" : "Endorse"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Vouches */}
            {vouchList.length > 0 && (
              <div className="card" style={{ padding: 14 }}>
                <div className="row between" style={{ marginBottom: 10 }}>
                  <span className="semi small row gap-6"><Handshake size={16} color="var(--green-500)" /> {vouchList.length + (hasVouched ? 1 : 0)} neighbors vouch for {p.displayName.split(" ")[0]}</span>
                </div>
                <div className="row" style={{ marginLeft: 6 }}>
                  {vouchList.slice(0, 6).map((v) => (
                    <SafeImg key={v.byUserId} src={v.byAvatar} variant="avatar" className="avatar" style={{ width: 36, height: 36, border: "2px solid #fff", marginLeft: -6 }} />
                  ))}
                  {hasVouched && (
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--green-500)", border: "2px solid #fff", marginLeft: -6, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
                      <Plus size={16} />
                    </div>
                  )}
                </div>
              </div>
            )}
            {!evalRes.isOpenNow && (
              <div className="card" style={{ padding: 12, background: "#fef3c7", border: "1px solid #fde68a" }}>
                <div className="row gap-8 center-v">
                  <Clock size={16} color="#d97706" />
                  <div>
                    <div className="bold tiny" style={{ color: "#92400e" }}>Provider Currently Offline</div>
                    <div className="tiny" style={{ color: "#b45309", marginTop: 1 }}>
                      {evalRes.statusText}. You can chat, ask questions, or schedule an appointment for their working hours below.
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div className="card" style={{ padding: 14 }}>
              <div className="row gap-10 small center-v">
                <Clock size={16} color="var(--green-500)" style={{ flexShrink: 0 }} />
                <div>
                  <div className="tiny semi muted" style={{ fontSize: 11, color: "var(--ink-500)" }}>Working Availability Timing</div>
                  <div className="semi" style={{ color: "var(--ink-900)" }}>{p.availabilityNote || "Available on request"}</div>
                </div>
              </div>
              <div className="divider" />
              <div className="row gap-10 small"><MapPin size={16} color="var(--green-500)" /><span>Serves within {p.serviceRadiusKm} km{p.distanceKm > 0 ? ` • ${p.distanceKm} km from you` : ""}</span></div>
              {/* Where they're based — one tap opens directions */}
              <div style={{ marginTop: 10 }}>
                <MiniMap lat={p.lat} lng={p.lng} pinColor="var(--green-500)" height={150} />
              </div>
            </div>
          </div>
        )}

        {tab === "posts" && (
          <div className="page-pad col gap-12">
            {(provPosts ?? []).length === 0 ? (
              <EmptyState emoji="📣" title="No posts yet" text="This provider hasn't posted to the community yet." />
            ) : (
              (provPosts ?? []).map((post) => (
                <button
                  key={post.id}
                  className="card col gap-6"
                  style={{ padding: 14, textAlign: "left" }}
                  onClick={() => nav(`/community/${post.id}`, { state: { post } })}
                >
                  <div className="row between">
                    <span className="semi small">{post.title || post.type}</span>
                    <span className="tiny muted">{post.postedAt}</span>
                  </div>
                  {post.body && <p className="small muted clamp-2" style={{ lineHeight: 1.5 }}>{post.body}</p>}
                  {post.image && <SafeImg src={post.image} style={{ width: "100%", height: 150, borderRadius: 12, objectFit: "cover" }} />}
                  <div className="row gap-14 tiny muted" style={{ marginTop: 2 }}>
                    <span className="row gap-4"><Heart size={13} /> {post.likes}</span>
                    <span className="row gap-4"><MessageCircle size={13} /> {post.commentsCount}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        )}

        {tab === "portfolio" && (
          <div className="page-pad">
            {p.portfolio.length === 0 ? (
              <EmptyState emoji="🖼️" title="No work samples yet" text="This provider hasn't added portfolio photos." />
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {p.portfolio.map((item) => (
                  <div key={item.id}>
                    <SafeImg src={item.url} alt={item.caption} className="thumb" style={{ width: "100%", height: 130, borderRadius: 14 }} />
                    <p className="tiny muted" style={{ marginTop: 4 }}>{item.caption}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "reviews" && (
          <div className="page-pad col gap-14">
            <button className="btn btn-outline btn-block" onClick={() => setReviewing(true)}>
              <Star size={16} /> Write a Review
            </button>
            {(reviews ?? []).slice(0, 3).map((rv) => (
              <div key={rv.id} className="row gap-10" style={{ alignItems: "flex-start" }}>
                <SafeImg src={rv.raterAvatar} variant="avatar" className="avatar" style={{ width: 38, height: 38 }} />
                <div className="grow">
                  <div className="row between"><span className="semi small">{rv.raterName}</span><span className="tiny muted">{rv.date}</span></div>
                  <StarRow value={rv.rating} size={12} />
                  <p className="small" style={{ marginTop: 4, lineHeight: 1.45 }}>{rv.comment}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="page-pad">
          <button className="row gap-6 tiny muted center" style={{ width: "100%", padding: 10 }} onClick={() => setReport(true)}>
            <Flag size={13} /> Report this provider
          </button>
        </div>
      </div>

      {/* Bottom action bar */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid var(--line)", padding: 12, zIndex: 30 }}>
        <div className="row gap-10">
          <div className="col" style={{ gap: 0 }}>
            <span className="tiny muted">Starting</span>
            <span className="bold" style={{ fontSize: 18, color: "var(--green-600)" }}>{inr(p.startingPrice)}</span>
          </div>
          {!isOwner && p.phone && p.showPhonePublicly !== false && (
            <a
              href={`tel:${p.phone}`}
              className="btn btn-outline"
              style={{ flex: 0 }}
              onClick={() => providerService.recordInteraction(p.id, "CALL").catch(() => {})}
            >
              <Phone size={17} />
            </a>
          )}
          {!isOwner && (
            <button
              className="btn btn-outline"
              style={{ flex: 0, color: "var(--brand-700)", borderColor: "var(--brand-200)", background: "var(--brand-50)" }}
              title="Message"
              onClick={async () => {
                if (!p.userId) { showToast("Provider info unavailable"); return; }
                try {
                  const conv = await chatService.getOrCreate(p.userId, {
                    type: "provider", id: p.id, name: p.displayName, avatar: p.avatar, ownerUserId: p.userId,
                  });
                  providerService.recordInteraction(p.id, "MESSAGE").catch(() => {});
                  nav(`/chat/${conv.id}`);
                } catch (e: any) { showToast(e?.message || "Couldn't open chat. Try again."); }
              }}
            >
              <MessageCircle size={17} />
            </button>
          )}
          {isOwner ? (
            <button
              className="btn btn-green grow"
              onClick={() => nav(`/provider/${p.id}/manage/leads`)}
            >
              <Clock size={17} /> View leads & appointments
            </button>
          ) : (
            <button
              className={`btn grow ${evalRes.isOpenNow ? "btn-green" : "btn-purple"}`}
              onClick={() => setScheduling(true)}
            >
              {evalRes.isOpenNow ? <><Zap size={17} /> Book now</> : <><Clock size={17} /> Schedule Appointment</>}
            </button>
          )}
        </div>
      </div>

      {report && <ReportSheet targetType="PROVIDER" targetId={p.id} name={p.displayName} onClose={() => setReport(false)} />}
      {share && <ShareCard title={safeName(p.displayName, "Local provider")} subtitle={`${p.categoryName} • from ${inr(p.startingPrice)}`} image={p.portfolio[0]?.url ?? p.avatar} meta={[p.ratingCount > 0 ? `⭐ ${p.ratingAvg}` : "", p.jobsDone > 0 ? `${p.jobsDone} jobs` : ""].filter(Boolean).join(" • ") || "New provider"} url={window.location.origin + "/provider/" + p.id} onClose={() => setShare(false)} />}
      {reviewing && (
        <ReviewSheet
          targetName={p.displayName}
          onSubmit={async (rating, comment) => {
            await providerService.addReview(p.id, rating, comment);
            refetch();
            refetchReviews();
          }}
          onClose={() => setReviewing(false)}
        />
      )}
      {scheduling && (
        <AppointmentSheet
          targetId={p.id}
          targetName={p.displayName}
          targetType="PROVIDER"
          availabilityNote={p.availabilityNote}
          availableNow={evalRes.isOpenNow}
          packages={(packages ?? []).map((pk) => ({ id: pk.id, name: pk.name, price: pk.price, duration: pk.duration }))}
          onClose={() => setScheduling(false)}
        />
      )}
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="grow col center" style={{ gap: 1 }}>
      <span className="bold" style={{ fontSize: 16 }}>{value}</span>
      <span className="tiny muted">{label}</span>
    </div>
  );
}
function Sep() {
  return <div style={{ width: 1, alignSelf: "stretch", background: "var(--line)" }} />;
}
