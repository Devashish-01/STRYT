import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Heart, Share2, Phone, BadgeCheck, MapPin, Clock,
  CheckCircle2, MessageCircle, Flag, Star, ThumbsUp,
  UserPlus, UserCheck, HandshakeIcon, Plus, Zap, Wallet,
} from "@/components/Icons";
import { providerService, socialService, communityService } from "@/services";
import { PostSummaryRow } from "@/components/cards";
import { chatService } from "@/services/engagement/chatService";
import ReviewSheet from "@/components/ReviewSheet";
import { useQuery, useQueryWithRealtime } from "@/hooks/useApi";
import { Skeleton, ErrorView } from "@/components/states";
import { Rating, StarRow, VegDot, EmptyState, SafeImg, inr, RatingBars, Pill } from "@/components/common";
import PhotoViewer, { type PhotoViewerItem } from "@/components/PhotoViewer";
import { useApp } from "@/store";
import GuestSignInPrompt from "@/components/GuestSignInPrompt";
import ReportSheet from "@/components/ReportSheet";
import ShareCard from "@/components/ShareCard";
import { StoryViewer } from "@/components/Stories";
import { AppointmentSheet } from "@/components/AppointmentSheet";
import { PaymentSheet } from "@/components/PaymentSheet";
import { evaluateProviderAvailability, formatHoursForDisplay } from "@/utils/availability";
import { appointmentService, isMockTarget } from "@/services/engagement/appointmentService";
import type { AppointmentRecord } from "@/types";
import { PROVIDER_BADGE_THRESHOLDS } from "@/lib/badges";
import { displayName as safeName } from "@/lib/publicName";
import { pushRecentlyViewed } from "@/lib/recentlyViewed";
import MiniMap from "@/components/MiniMap";
import { resolvePackage, BUSINESS_PACKAGES } from "@/lib/businessPackages";
import { BizCatalogGrid } from "@/screens/business/BizCatalogGrid";
import { useI18n } from "@/lib/i18n";

const Handshake = HandshakeIcon as any;

export default function ProviderDetail() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const {
    user,
    isBookmarked, toggleBookmark, showToast,
    isFollowing, toggleFollow, vouched, toggleVouch, endorsed, toggleEndorse,
    isGuest,
  } = useApp();
  const { t, tf } = useI18n();

  const { data: p, loading, error, refetch } = useQuery(() => providerService.get(id, user.lat || undefined, user.lng || undefined), [id, user.lat, user.lng], `provider:${id}`);
  const { data: reviews, refetch: refetchReviews } = useQueryWithRealtime(() => providerService.reviews(id), "ratings", [id], `ratee_id=eq.${id}`, `provider:${id}:reviews`);
  const { data: vouches } = useQueryWithRealtime(() => socialService.vouches(id), "vouches", [id], `provider_id=eq.${id}`, `provider:${id}:vouches`);
  const { data: endorsements } = useQueryWithRealtime(() => socialService.endorsements(id), "endorsements", [id], `provider_id=eq.${id}`, `provider:${id}:endorsements`);
  const { data: availList } = useQuery(() => socialService.availableNow(), [], "available-now");
  const { data: provPosts } = useQueryWithRealtime(() => communityService.byAuthorRef("provider", id), "community_posts", [id], `author_ref_id=eq.${id}`, `provider:${id}:posts`);
  const { data: highlightsData } = useQuery(() => socialService.highlightsFor("provider", id), [id], `provider:${id}:highlights`);
  const highlights = highlightsData ?? [];
  const { data: myAppointments, refetch: refetchMyAppointments } = useQuery(
    () => (user.id ? appointmentService.listForCustomer(user.id) : Promise.resolve([])),
    [user.id],
    `home:appointments:${user.id}`
  );

  // Count a profile view once per provider open.
  useEffect(() => {
    providerService.recordView(id).catch(() => {});
  }, [id]);

  // Track for the "recently viewed" rail on Home once details are loaded.
  useEffect(() => {
    if (!p) return;
    pushRecentlyViewed({ type: "provider", id: p.id, name: p.displayName, image: p.avatar });
    // `p` is excluded deliberately — same reason as BusinessDetail's
    // equivalent effect: a fresh object reference every refetch, so `p?.id`
    // is the correct identity check to avoid re-pushing on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p?.id]);
  const [tab, setTab] = useState<"about" | "posts" | "portfolio" | "reviews">("about");
  const [report, setReport] = useState(false);
  const [share, setShare] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [viewingHighlight, setViewingHighlight] = useState<number | null>(null);
  const [viewingPhotos, setViewingPhotos] = useState<{ photos: PhotoViewerItem[]; startIndex: number } | null>(null);
  const [payingApt, setPayingApt] = useState<AppointmentRecord | null>(null);

  if (loading) {
    return (
      <div className="screen">
        <div style={{ background: "linear-gradient(135deg,var(--green-500),var(--green-600))", padding: "12px 16px 24px" }}>
          <Skeleton h={78} w={78} r={39} />
        </div>
        <div className="page-pad col gap-12" style={{ marginTop: -14 }}>
          <div className="card"><Skeleton h={44} mb={0} /></div>
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
        <EmptyState emoji="👤" title={t("provider_not_found")} text={t("provider_not_found_desc")} />
      </div>
    );
  }
  const saved = isBookmarked("PROVIDER", p.id);
  const following = isFollowing("PROVIDER", p.id);
  const isOwner = p.userId === user.id;
  // The customer is beyond the provider's own service radius — surface a
  // non-blocking heads-up in the booking sheet (booking stays allowed).
  const outOfRange =
    typeof p.distanceKm === "number" &&
    typeof p.serviceRadiusKm === "number" &&
    p.serviceRadiusKm > 0 &&
    p.distanceKm > p.serviceRadiusKm;
  // Surface a quick-pay banner when the customer has an unsettled appointment
  // with this exact provider, so they don't have to go find it in My Appointments.
  const payableApt = !isOwner
    ? (myAppointments ?? []).find(
        (a) =>
          a.targetId === p.id &&
          a.targetType === "PROVIDER" &&
          a.status !== "CANCELLED" &&
          a.status !== "REJECTED" &&
          (a.paymentStatus ?? "UNPAID") === "UNPAID"
      ) ?? null
    : null;
  const vouchList = vouches ?? [];
  const hasVouched = vouched.includes(p.id);
  const endorseList = endorsements ?? [];
  const avail = (availList ?? []).find((a) => a.providerId === p.id);
  const evalRes = evaluateProviderAvailability(p.availabilityNote, p.isAvailableNow, p.availableUntil);
  const heroPhoto = p.portfolio[0]?.url;
  // Business Packages (Phase 3) — providers previously got nothing (this
  // screen shares zero code with BusinessDetail.tsx). Unlike a business,
  // whose untouched/"generic" identity is already brand purple (the same
  // default --biz-accent-* resolves to), a provider's untouched identity is
  // green — so accent/accentSoft fall back to the literal green this screen
  // already used everywhere, rather than trusting --biz-accent's :root
  // default, which would silently repaint every untouched provider purple.
  const bizThemeKey = resolvePackage(p);
  const bizTheme = BUSINESS_PACKAGES[bizThemeKey];
  const accent = bizThemeKey === "generic" ? "var(--green-600)" : "var(--biz-accent-strong)";
  const accentSoft = bizThemeKey === "generic" ? "var(--green-100)" : "var(--biz-accent-soft)";
  // Structural "does this provider take bookings at all" — null inherits the
  // resolved package's own default. Distinct from p.isOpenNow, which is a
  // temporary pause and still renders its own disabled state below.
  const bookingsOn = p.bookingsEnabled ?? bizTheme.bookingsDefault;

  return (
    <div className="screen" style={{ position: "relative" }} data-biz-theme={bizThemeKey === "generic" ? undefined : bizThemeKey}>
      <div className="screen-scroll" style={{ paddingBottom: 90 }}>
        {isMockTarget(id) && (
          <div style={{ padding: "8px 14px", background: "var(--orange-50)", borderBottom: "1px solid var(--orange-100)" }}>
            <span className="tiny" style={{ color: "var(--amber-700)", fontWeight: 600 }}>Demo preview — bookings here aren't saved or sent to an owner.</span>
          </div>
        )}
        {/* Header */}
        <div
          onClick={heroPhoto ? () => setViewingPhotos({ photos: p.portfolio.map((i) => ({ url: i.url, caption: i.caption })), startIndex: 0 }) : undefined}
          style={{
            background: heroPhoto
              ? `linear-gradient(160deg, rgba(22,163,74,0.88), rgba(21,128,61,0.92)), url(${heroPhoto}) center/cover`
              : "linear-gradient(135deg,var(--green-500),var(--green-600))",
            color: "#fff", padding: "calc(12px + var(--safe-area-top)) 16px 24px",
            cursor: heroPhoto ? "pointer" : "default",
          }}
        >
          <div className="row between">
            <button className="icon-btn" style={{ background: "rgba(255,255,255,0.18)", color: "#fff" }} onClick={(e) => { e.stopPropagation(); nav(-1); }}><ArrowLeft size={20} /></button>
            <div className="row gap-8">
              {/* Call stays available to guests — it's the provider's own
                  published number, and recordInteraction's lead insert is
                  already `if (uid)`, so a signed-out tap records no lead.
                  Share/save need an account, so those stay hidden. */}
              {!isOwner && p.phone && p.showPhonePublicly !== false && (
                <a
                  className="icon-btn"
                  style={{ background: "rgba(255,255,255,0.18)", color: "#fff" }}
                  href={`tel:${p.phone}`}
                  aria-label="Call"
                  onClick={(e) => { e.stopPropagation(); providerService.recordInteraction(p.id, "CALL").catch(() => {}); }}
                >
                  <Phone size={18} />
                </a>
              )}
              {!isGuest && (
                <>
                  <button className="icon-btn" style={{ background: "rgba(255,255,255,0.18)", color: "#fff" }} onClick={(e) => { e.stopPropagation(); setShare(true); }}><Share2 size={18} /></button>
                  {!isOwner && (
                    <button className="icon-btn" style={{ background: "rgba(255,255,255,0.18)", color: "#fff" }} onClick={(e) => { e.stopPropagation(); toggleBookmark("PROVIDER", p.id); }}>
                      <Heart size={18} weight={saved ? "fill" : "regular"} color={saved ? "var(--red-500)" : "var(--ink-900)"} />
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="row gap-14" style={{ marginTop: 14 }}>
            <SafeImg
              src={p.avatar}
              alt={p.displayName}
              variant="avatar"
              className="avatar"
              style={{ width: 78, height: 78, border: "3px solid rgba(255,255,255,0.4)" }}
              onClick={(e) => { e.stopPropagation(); setViewingPhotos({ photos: [{ url: p.avatar }], startIndex: 0 }); }}
            />
            <div className="grow">
              <div className="row gap-6 center-v">
                <span className="bold" style={{ fontSize: 20 }}>{safeName(p.displayName, t("local_provider_fallback"))}</span>
                {p.isVerified && <BadgeCheck size={18} color="#fff" />}
                {isOwner && <Pill tone="purple">{t("owner_badge")}</Pill>}
              </div>
              <div className="small" style={{ opacity: 0.9 }}>{p.categoryName} • {p.subCategory}</div>
              <div className="row gap-8" style={{ marginTop: 6 }}>
                <span className="badge" style={{ background: "rgba(255,255,255,0.22)", color: "#fff" }}>
                  <Star size={11} fill="var(--amber-500)" strokeWidth={0} /> {p.ratingCount > 0 ? `${p.ratingAvg} (${p.ratingCount})` : t("new_word")}
                </span>
                {p.isNew && <span className="badge badge-new">NEW</span>}
                {avail && <span className="badge" style={{ background: "#fff", color: "var(--green-500)" }}>⚡ Free till {avail.availableUntil}</span>}
              </div>
            </div>
          </div>
        </div>

        {/* Follow + Book row */}
        <div className="page-pad" style={{ paddingTop: 0, paddingBottom: 0, marginTop: -14 }}>
          <div className="card row" style={{ padding: 14 }}>
            <Stat value={p.jobsDone.toString()} label={t("jobs_done_label")} />
            <Sep />
            <Stat value={`${p.serviceRadiusKm} km`} label={t("service_area_label")} />
            <Sep />
            <Stat value={p.responseTime} label={t("responds_label")} />
          </div>
        </div>

        {/* Follow + vouch row — a vouch is a trust signal that only means
            something from a real, accountable neighbour, so guests get the
            sign-in prompt in place of the whole row. Owners don't follow or
            vouch for themselves, so the row is skipped entirely for them. */}
        {isGuest ? (
          <div className="page-pad" style={{ paddingTop: 12 }}>
            <GuestSignInPrompt message="Sign in to book, message or follow" compact />
          </div>
        ) : isOwner ? null : (
          <div className="page-pad row gap-10" style={{ paddingTop: 12 }}>
            <button
              className="btn grow btn-sm"
              style={{ background: following ? "var(--brand-100)" : "var(--ink-50)", color: following ? "var(--brand-700)" : "var(--ink-700)" }}
              onClick={() => toggleFollow("PROVIDER", p.id, p.displayName)}
            >
              {following ? <><UserCheck size={16} /> {t("following")}</> : <><UserPlus size={16} /> {t("follow")}</>}
            </button>
            <button
              className="btn grow btn-sm"
              style={{ background: hasVouched ? "var(--green-100)" : "var(--ink-50)", color: hasVouched ? "var(--green-600)" : "var(--ink-700)" }}
              onClick={() => toggleVouch(p.id)}
            >
              <ThumbsUp size={15} weight={hasVouched ? "fill" : "regular"} /> {hasVouched ? t("vouched") : t("vouch")}
            </button>
          </div>
        )}

        {/* Highlights — stories the provider saved past their normal expiry */}
        {highlights.length > 0 && (
          <div className="hscroll" style={{ padding: "12px 16px 4px" }}>
            {highlights.map((h, i) => (
              <button key={h.id} className="col center" style={{ gap: 6, width: 68, flexShrink: 0 }} onClick={() => setViewingHighlight(i)}>
                <div style={{ width: 60, height: 60, borderRadius: "50%", padding: 2.5, background: "linear-gradient(135deg,var(--amber-500),var(--amber-500))" }}>
                  <SafeImg src={h.image} variant="photo" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover", border: "2px solid #fff" }} />
                </div>
                <span className="tiny semi ellipsis" style={{ maxWidth: 62, textAlign: "center" }}>{h.caption || t("highlight_word")}</span>
              </button>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="row page-pad" style={{ paddingTop: 10, paddingBottom: 0, borderBottom: "1px solid var(--line)", position: "sticky", top: 0, background: "var(--bg)", zIndex: 5 }}>
          {([["about", t("tab_about")], ["posts", tf("tab_posts_count", { count: (provPosts ?? []).length })], ["portfolio", tf("tab_work_count", { count: p.portfolio.length })], ["reviews", t("tab_reviews")]] as const).map(([tabKey, label]) => (
            <button key={tabKey} onClick={() => setTab(tabKey)} className="semi"
          style={{ flex: 1, padding: "10px 0", fontSize: 14, color: tab === tabKey ? accent : "var(--ink-500)", borderBottom: tab === tabKey ? `2.5px solid ${accent}` : "2.5px solid transparent" }}>
              {label}
            </button>
          ))}
        </div>

        {tab === "about" && (
          <div className="page-pad col gap-16" style={{ paddingTop: 18 }}>
            {p.bio && <p className="small" style={{ lineHeight: 1.7, color: "var(--ink-700)" }}>{p.bio}</p>}

            {/* Computed badges from real provider data — no extra DB queries */}
            {(() => {
              const responseHrs = parseInt(p.responseTime ?? "99");
              const badges: { label: string; emoji: string }[] = [
                ...(p.isVerified ? [{ label: t("verified_badge"), emoji: "✓" }] : []),
                ...(p.ratingAvg >= PROVIDER_BADGE_THRESHOLDS.topRatedMinRating && p.ratingCount >= PROVIDER_BADGE_THRESHOLDS.topRatedMinReviews ? [{ label: t("top_rated_badge"), emoji: "⭐" }] : []),
                ...(!isNaN(responseHrs) && responseHrs <= PROVIDER_BADGE_THRESHOLDS.fastResponderMaxHrs ? [{ label: t("fast_responder_badge"), emoji: "⚡" }] : []),
                ...(p.jobsDone >= PROVIDER_BADGE_THRESHOLDS.jobsMilestone ? [{ label: tf("jobs_milestone_badge", { n: PROVIDER_BADGE_THRESHOLDS.jobsMilestone }), emoji: "💼" }] : []),
                ...(p.isNew ? [{ label: t("new_provider_badge"), emoji: "🌟" }] : []),
              ];
              if (badges.length === 0) return null;
              return (
                <div>
                  <div className="semi small" style={{ marginBottom: 8 }}>{t("badges_label")}</div>
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
              <div className="semi small" style={{ marginBottom: 8 }}>{t("services_skills_label")}</div>
              <div className="row wrap gap-8">
                {p.skills.map((s) => (
                  <span key={s} className="row gap-6 badge badge-green" style={{ padding: "7px 12px" }}>
                    <CheckCircle2 size={13} /> {s}
                  </span>
                ))}
              </div>
            </div>

            {/* Catalog — photo grid for packages whose catalogRenderMode is
                "grid" (e.g. events, for a wedding photographer), otherwise
                the plain list this screen always used. The grid needs a
                cart/add pair for BizCatalogGrid's shared signature, but every
                package reachable by a provider today has showCartStepper
                false (dining/takeaway/shop — the only "true" packages —
                aren't provider-selectable categories), so the stepper UI
                never actually renders and these are safely no-ops. */}
            {(p.catalog ?? []).length > 0 && (
              <div>
                {/* "Catalog", not "Catalogue" (bizTheme.catalogNoun's generic
                    value) — this heading's own original literal, kept exact
                    for untouched providers. */}
                <div className="semi small" style={{ marginBottom: 8 }}>{bizThemeKey === "generic" ? "Catalog" : bizTheme.catalogNoun}</div>
                {bizTheme.catalogRenderMode === "grid" ? (
                  <BizCatalogGrid
                    catalog={p.catalog ?? []}
                    cart={{}}
                    add={() => {}}
                    isOwner={isOwner}
                    isGuest={isGuest}
                    bizTheme={bizTheme}
                    bookingsOn={bookingsOn}
                    onOpenPhoto={(item) => setViewingPhotos({ photos: [{ url: item.image, caption: item.name }], startIndex: 0 })}
                    onBook={() => setScheduling(true)}
                  />
                ) : (
                  <div className="col gap-8">
                    {(p.catalog ?? []).map((item) => (
                      <div key={item.id} className="card row gap-12" style={{ padding: 12 }}>
                        <div className="grow">
                          <div className="row gap-6">
                            {item.isFood && item.isVeg != null && <VegDot veg={item.isVeg} />}
                            <span className="semi small">{item.name}</span>
                            {item.bestSeller && <span className="badge badge-amber">⭐</span>}
                          </div>
                          {item.description && <div className="tiny muted">{item.description}</div>}
                        </div>
                        <div className="bold small" style={{ color: accent }}>{inr(item.salePrice ?? item.price)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Endorsements */}
            {endorseList.length > 0 && (
              <div>
                <div className="semi small" style={{ marginBottom: 8 }}>{t("endorsed_by_neighbors")}</div>
                <div className="col gap-8">
                  {endorseList.map((e) => {
                    const key = `${p.id}:${e.skill}`;
                    const isOn = endorsed.includes(key);
                    const count = e.count + (isOn && !e.endorsed ? 1 : 0) - (!isOn && e.endorsed ? 1 : 0);
                    return (
                      <div key={e.skill} className="row gap-10 card" style={{ padding: "10px 12px" }}>
                        <span className="grow semi small">{e.skill}</span>
                        <span className="tiny muted">{count}</span>
                        {/* Guests see how many neighbours endorsed a skill, but
                            can't add an endorsement — it's a trust signal.
                            Owners don't endorse their own skills. */}
                        {!isGuest && !isOwner && (
                          <button
                            className="btn btn-sm"
                            style={{ padding: "6px 12px", background: isOn ? "var(--brand-100)" : "var(--ink-50)", color: isOn ? "var(--brand-700)" : "var(--ink-700)" }}
                            onClick={() => toggleEndorse(p.id, e.skill)}
                          >
                            <ThumbsUp size={13} weight={isOn ? "fill" : "regular"} /> {isOn ? t("endorsed") : t("endorse")}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Vouches */}
            {vouchList.length > 0 && (
              <div className="card">
                <div className="row between" style={{ marginBottom: 10 }}>
                  <span className="semi small row gap-6"><Handshake size={16} color="var(--green-500)" /> {tf("neighbors_vouch_for", { count: vouchList.length + (hasVouched ? 1 : 0), name: p.displayName.split(" ")[0] })}</span>
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
            {p.isOpenNow === false && (
              <div className="card card-condensed" style={{ background: "var(--red-50)", border: "1px solid var(--red-100)" }}>
                <div className="row gap-8 center-v">
                  <Clock size={16} color="var(--red-600)" />
                  <div>
                    <div className="bold tiny" style={{ color: "var(--red-700)" }}>{t("not_accepting_appointments")}</div>
                    <div className="tiny" style={{ color: "var(--red-700)", marginTop: 1 }}>
                      {t("provider_paused_bookings")}
                    </div>
                  </div>
                </div>
              </div>
            )}
            {!evalRes.isOpenNow && p.isOpenNow !== false && (
              <div className="card card-condensed" style={{ background: "var(--amber-100)", border: "1px solid var(--amber-100)" }}>
                <div className="row gap-8 center-v">
                  <Clock size={16} color="var(--amber-700)" />
                  <div>
                    <div className="bold tiny" style={{ color: "var(--amber-700)" }}>{t("provider_offline")}</div>
                    <div className="tiny" style={{ color: "var(--amber-700)", marginTop: 1 }}>
                      {tf("provider_offline_desc", { status: evalRes.statusText })}
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div className="card">
              <div className="row gap-10 small center-v">
                <Clock size={16} color="var(--green-500)" style={{ flexShrink: 0 }} />
                <div>
                  <div className="tiny semi muted" style={{ fontSize: 11, color: "var(--ink-500)" }}>{t("working_availability_timing")}</div>
                  <div className="semi" style={{ color: "var(--ink-900)" }}>{p.availabilityNote ? formatHoursForDisplay(p.availabilityNote) : t("available_on_request")}</div>
                </div>
              </div>
              <div className="divider" />
              <div className="row gap-10 small"><MapPin size={16} color="var(--green-500)" /><span>{tf("serves_within_km", { km: p.serviceRadiusKm })}{p.distanceKm > 0 ? tf("km_from_you", { km: p.distanceKm }) : ""}</span></div>
              {/* Where they're based — one tap opens directions */}
              <div style={{ marginTop: 10 }}>
                <MiniMap lat={p.lat} lng={p.lng} pinColor="var(--green-500)" height={150} />
              </div>
            </div>
          </div>
        )}

        {tab === "posts" && (
          <div className="page-pad col gap-12" style={{ paddingTop: 18 }}>
            {(provPosts ?? []).length === 0 ? (
              <EmptyState emoji="📣" title={t("no_posts_yet")} text={t("provider_no_posts_desc")} />
            ) : (
              (provPosts ?? []).map((post) => (
                <PostSummaryRow key={post.id} post={post} onClick={() => nav(`/community/${post.id}`, { state: { post } })} />
              ))
            )}
          </div>
        )}

        {tab === "portfolio" && (
          <div className="page-pad" style={{ paddingTop: 18 }}>
            {p.portfolio.length === 0 ? (
              <EmptyState emoji="🖼️" title={t("no_work_samples")} text={t("provider_no_portfolio_desc")} />
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {p.portfolio.map((item, i) => (
                  <div key={item.id}>
                    <SafeImg
                      src={item.url}
                      alt={item.caption}
                      className="thumb"
                      style={{ width: "100%", height: 140, borderRadius: 14, cursor: "pointer" }}
                      onClick={() => setViewingPhotos({ photos: p.portfolio.map((it) => ({ url: it.url, caption: it.caption })), startIndex: i })}
                    />
                    {item.caption && <p className="tiny muted" style={{ marginTop: 6 }}>{item.caption}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "reviews" && (
          <div className="page-pad col gap-14" style={{ paddingTop: 18 }}>
            {!isGuest && !isOwner && (
              <button className="btn btn-outline btn-block" onClick={() => setReviewing(true)}>
                <Star size={16} /> {t("write_review")}
              </button>
            )}
            {(reviews ?? []).length === 0 && (
              <EmptyState emoji="⭐" title={t("no_reviews_yet")} text={isGuest ? t("no_one_reviewed_provider") : t("be_first_review")} />
            )}
            {(reviews ?? []).length > 0 && (
              <div className="card" style={{ padding: "12px 16px" }}>
                <RatingBars ratings={(reviews ?? []).map((rv) => rv.rating)} />
              </div>
            )}
            {(reviews ?? []).map((rv) => (
              <div key={rv.id} className="card row gap-12" style={{ alignItems: "flex-start", padding: "14px 14px" }}>
                <SafeImg src={rv.raterAvatar} variant="avatar" className="avatar" style={{ width: 40, height: 40, flexShrink: 0 }} />
                <div className="grow">
                  <div className="row between"><span className="semi small">{rv.raterName}</span><span className="tiny muted">{rv.date}</span></div>
                  <div className="row gap-8 align-center">
                    <StarRow value={rv.rating} size={12} />
                    {rv.isVerifiedBooking && (
                      <span className="tiny semi row gap-2" style={{ color: "var(--green-600)", alignItems: "center" }}>
                        <BadgeCheck size={11} /> {t("verified_booking")}
                      </span>
                    )}
                  </div>
                  <p className="small" style={{ marginTop: 6, lineHeight: 1.55 }}>{rv.comment}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {!isGuest && !isOwner && (
          <div className="page-pad">
            <button className="row gap-6 tiny muted center" style={{ width: "100%", padding: 10 }} onClick={() => setReport(true)}>
              <Flag size={13} /> {t("report_provider")}
            </button>
          </div>
        )}
      </div>

      {/* Bottom action bar — a guest still sees the starting price (that's the
          thing they came to find out), but the call/message/book controls are
          replaced by a single sign-in prompt. */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid var(--line)", padding: 12, zIndex: 30 }}>
        <div className="row gap-10">
          <div className="col" style={{ gap: 0 }}>
            <span className="tiny muted">{t("starting_label")}</span>
            <span className="bold" style={{ fontSize: 18, color: "var(--green-600)" }}>{inr(p.startingPrice)}</span>
          </div>
          {isGuest && (
            <div className="grow">
              <GuestSignInPrompt message="Sign in to book or message" compact />
            </div>
          )}
          {/* Call is available to guests too — see the header comment above. */}
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
          {!isGuest && !isOwner && (
            <button
              className="btn btn-outline"
              style={{ flex: 0, color: "var(--brand-700)", borderColor: "var(--brand-200)", background: "var(--brand-50)" }}
              title={t("message")}
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
          {isGuest ? null : isOwner ? (
            <button
              className="btn btn-green grow"
              onClick={() => nav(`/provider/${p.id}/manage/jobs`)}
            >
              <Clock size={17} /> {t("view_jobs_appointments")}
            </button>
          ) : !bookingsOn ? null : p.isOpenNow === false ? (
            <button className="btn grow" style={{ background: "var(--ink-50)", color: "var(--ink-400)" }} disabled>
              <Clock size={17} /> {bizTheme.bookingClosedLabel}
            </button>
          ) : bizThemeKey === "generic" ? (
            <button
              className={`btn grow ${evalRes.isOpenNow ? "btn-green" : "btn-purple"}`}
              onClick={() => setScheduling(true)}
            >
              {evalRes.isOpenNow ? <><Zap size={17} /> {t("book_now")}</> : <><Clock size={17} /> {t("schedule_appointment")}</>}
            </button>
          ) : (
            <button
              className="btn grow"
              style={{ background: accentSoft, color: accent }}
              onClick={() => setScheduling(true)}
            >
              <Clock size={17} /> {bizTheme.primaryCtaLabel}
            </button>
          )}
        </div>

        {payableApt && (
          <button
            className="row gap-10"
            style={{ width: "100%", marginTop: 10, padding: "12px 14px", background: "var(--brand-50)", border: "1.5px solid var(--brand-200)", borderRadius: 14 }}
            onClick={() => setPayingApt(payableApt)}
          >
            <Wallet size={18} color="var(--brand-700)" />
            <span className="semi small grow" style={{ textAlign: "left", color: "var(--brand-700)" }}>
              {payableApt.packagePrice ? tf("pay_amount_now", { amount: payableApt.packagePrice }) : t("pay_for_appointment")}
            </span>
          </button>
        )}
      </div>

      {payingApt && (
        <PaymentSheet
          appointment={payingApt}
          businessUpiId={p.upiId ?? null}
          businessName={p.displayName}
          onPaid={refetchMyAppointments}
          onClose={() => setPayingApt(null)}
        />
      )}

      {viewingHighlight !== null && (
        <StoryViewer stories={highlights} startIndex={viewingHighlight} onClose={() => setViewingHighlight(null)} />
      )}
      {viewingPhotos && (
        <PhotoViewer photos={viewingPhotos.photos} startIndex={viewingPhotos.startIndex} onClose={() => setViewingPhotos(null)} />
      )}
      {report && <ReportSheet targetType="PROVIDER" targetId={p.id} name={p.displayName} onClose={() => setReport(false)} />}
      {share && <ShareCard title={safeName(p.displayName, t("local_provider_fallback"))} subtitle={`${p.categoryName} • from ${inr(p.startingPrice)}`} image={p.portfolio[0]?.url ?? p.avatar} meta={[p.ratingCount > 0 ? `⭐ ${p.ratingAvg}` : "", p.jobsDone > 0 ? `${p.jobsDone} jobs` : ""].filter(Boolean).join(" • ") || t("new_provider_badge")} url={window.location.origin + "/provider/" + p.id} onClose={() => setShare(false)} />}
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
          packages={(p.catalog ?? [])
            .filter((item) => item.stockStatus !== "OUT_OF_STOCK")
            .map((item) => ({ id: item.id, name: item.name, price: item.salePrice ?? item.price }))}
          paymentTiming={p.paymentTiming}
          payeeUpiId={p.upiId}
          depositPercent={(p as any).depositPercent}
          outOfRange={outOfRange}
          vocabulary={bizTheme.vocabulary}
          targetPackageKey={bizThemeKey}
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
