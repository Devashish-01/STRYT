import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Heart, Share2, Phone, Navigation, Clock, MapPin,
  BadgeCheck, Star, Plus, Minus, Tag, MessageCircle, Flag,
  Bookmark, Bell, UserPlus, UserCheck, Users, HelpCircle,
} from "@/components/Icons";
import { businessService, communityService } from "@/services";
import { chatService } from "@/services/engagement/chatService";
import ReviewSheet from "@/components/ReviewSheet";
import { useQuery, useQueryWithRealtime } from "@/hooks/useApi";
import { Skeleton, ErrorView } from "@/components/states";
import { Rating, StarRow, VegDot, EmptyState, SafeImg, inr } from "@/components/common";
import { useApp } from "@/store";
import ReportSheet from "@/components/ReportSheet";
import ShareCard from "@/components/ShareCard";
import AddToListSheet from "@/components/AddToListSheet";
import { AppointmentSheet } from "@/components/AppointmentSheet";
import { evaluateProviderAvailability, DEFAULT_WORKING_HOURS } from "@/utils/availability";
import { isMockTarget } from "@/services/engagement/appointmentService";
import { distanceLabel } from "@/lib/format";
import { displayName as safeName } from "@/lib/publicName";
import MiniMap from "@/components/MiniMap";

export default function BusinessDetail() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const {
    user,
    isBookmarked, toggleBookmark, showToast,
    isFollowing, toggleFollow, notifySubs, toggleNotify,
    queuesJoined, joinQueue,
  } = useApp();

  const { data: b, loading, error, refetch } = useQuery(() => businessService.get(id, user.lat || undefined, user.lng || undefined), [id, user.lat, user.lng]);
  const { data: reviews, refetch: refetchReviews } = useQueryWithRealtime(() => businessService.reviews(id), "ratings", [id], `ratee_id=eq.${id}`);
  const { data: queue } = useQueryWithRealtime(() => businessService.queue(id), "queue_tokens", [id], `business_id=eq.${id}`);
  const { data: qnaList, refetch: refetchQna } = useQueryWithRealtime(() => businessService.qna(id), "business_qna", [id], `business_id=eq.${id}`);
  const { data: bizPosts } = useQueryWithRealtime(() => communityService.byAuthorRef("business", id), "community_posts", [id], `author_ref_id=eq.${id}`);
  const [tab, setTab] = useState<"catalog" | "posts" | "about" | "reviews">("catalog");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [report, setReport] = useState(false);
  const [share, setShare] = useState(false);
  const [addList, setAddList] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [question, setQuestion] = useState("");
  const [askingNow, setAskingNow] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [schedulingPkg, setSchedulingPkg] = useState<{ id: string; name: string; price: number; duration?: string } | null>(null);
  const [checkoutMode, setCheckoutMode] = useState(false);
  const [checkoutNotes, setCheckoutNotes] = useState("");

  // Count a profile view once per business open.
  useEffect(() => {
    businessService.recordView(id).catch(() => {});
  }, [id]);

  async function submitQuestion() {
    if (question.trim().length < 5) return;
    setAskingNow(true);
    try {
      await businessService.askQuestion(id, question.trim());
      setQuestion("");
      showToast("Question sent to the owner");
      refetchQna();
    } catch {
      showToast("Couldn't send. Sign in and try again.");
    } finally {
      setAskingNow(false);
    }
  }

  if (loading) {
    return (
      <div className="screen">
        <div className="screen-scroll">
          <Skeleton h={230} r={0} />
          <div className="page-pad col gap-12" style={{ marginTop: -22 }}>
            <div className="card col gap-10" style={{ padding: 16 }}>
              <Skeleton h={24} w="60%" />
              <Skeleton h={14} w="40%" />
              <Skeleton h={44} mb={0} />
            </div>
          </div>
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

  if (!b) {
    return (
      <div className="screen">
        <EmptyState emoji="🏪" title="Shop not found" text="This business may have closed or moved." />
      </div>
    );
  }

  // Presence ("open right now") is driven by the owner's toggle + working
  // hours — the same evaluator providers use. Booking is NOT gated on this.
  const evalRes = evaluateProviderAvailability(b.hours, b.isAvailableNow, b.availableUntil);
  const isOwner = b.ownerUserId === user.id;
  const saved = isBookmarked("BUSINESS", b.id);
  const following = isFollowing("BUSINESS", b.id);
  const inQueue = queuesJoined.includes(b.id);
  const notifyKey = `OPENS:${b.id}`;
  const notifying = notifySubs.includes(notifyKey);
  const cartCount = Object.values(cart).reduce((a, c) => a + c, 0);
  const cartTotal = Object.entries(cart).reduce((sum, [itemId, qty]) => {
    const item = b.catalog.find((c) => c.id === itemId);
    return sum + (item ? (item.salePrice ?? item.price) * qty : 0);
  }, 0);

  function add(itemId: string, delta: number) {
    setCart((c) => {
      const next = Math.max(0, (c[itemId] ?? 0) + delta);
      const copy = { ...c };
      if (next === 0) delete copy[itemId];
      else copy[itemId] = next;
      return copy;
    });
  }

  // Checkout reuses the exact same booking + UPI/Cash payment flow as "Book
  // appointment" — the cart becomes a single locked-in package, itemized in
  // the notes, and the customer picks a pickup/collection slot to confirm.
  function checkout() {
    const lines = Object.entries(cart)
      .map(([itemId, qty]) => {
        const item = b!.catalog.find((c) => c.id === itemId);
        return item ? `${item.name} x${qty}` : null;
      })
      .filter(Boolean);
    setCheckoutNotes(`Order: ${lines.join(", ")}`);
    setSchedulingPkg({
      id: "cart",
      name: lines.length === 1 ? lines[0]! : `${cartCount} items`,
      price: cartTotal,
    });
    setCheckoutMode(true);
    setScheduling(true);
  }

  return (
    <div className="screen" style={{ position: "relative" }}>
      <div className="screen-scroll" style={{ paddingBottom: cartCount ? 88 : 24 }}>
        {isMockTarget(id) && (
          <div style={{ padding: "8px 14px", background: "#fff3e8", borderBottom: "1px solid #ffd9b3" }}>
            <span className="tiny" style={{ color: "#b45309", fontWeight: 600 }}>Demo preview — bookings here aren't saved or sent to an owner.</span>
          </div>
        )}
        {/* Cover */}
        <div style={{ position: "relative" }}>
          <SafeImg src={b.coverImage} alt={b.name} style={{ width: "100%", height: 230, objectFit: "cover" }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,0.35), transparent 35%, transparent 70%, rgba(0,0,0,0.25))" }} />
          <div className="row between" style={{ position: "absolute", top: 12, left: 12, right: 12 }}>
            <button className="icon-btn" style={{ background: "rgba(255,255,255,0.92)" }} onClick={() => nav(-1)}><ArrowLeft size={20} /></button>
            <div className="row gap-8">
              <button className="icon-btn" style={{ background: "rgba(255,255,255,0.92)" }} onClick={() => setShare(true)}><Share2 size={18} /></button>
              <button className="icon-btn" style={{ background: "rgba(255,255,255,0.92)" }} onClick={() => setAddList(true)}><Bookmark size={18} /></button>
              <button className="icon-btn" style={{ background: "rgba(255,255,255,0.92)" }} onClick={() => toggleBookmark("BUSINESS", b.id)}>
                <Heart size={18} fill={saved ? "var(--red-500)" : "none"} color={saved ? "var(--red-500)" : "#5c5573"} />
              </button>
            </div>
          </div>
          {b.gallery.length > 0 && (
            <div className="row gap-6" style={{ position: "absolute", bottom: 12, right: 12 }}>
              {[b.coverImage, ...b.gallery].slice(0, 3).map((g, i) => (
                <img key={i} src={g} style={{ width: 40, height: 40, borderRadius: 8, border: "2px solid #fff", objectFit: "cover" }} />
              ))}
            </div>
          )}
        </div>

        {/* Info card */}
        <div className="page-pad" style={{ marginTop: -22, position: "relative" }}>
          <div className="card">
            <div className="row between" style={{ alignItems: "flex-start" }}>
              <div style={{ minWidth: 0 }}>
                <div className="row gap-6">
                  <h1 className="bold h2">{b.name}</h1>
                  {b.isVerified && <BadgeCheck size={18} color="#e5521c" fill="#ffe8e2" />}
                </div>
                <p className="small muted" style={{ marginTop: 2 }}>{b.subCategory}</p>
              </div>
              <div className="col" style={{ alignItems: "center", gap: 2 }}>
                <Rating value={b.ratingAvg} size={14} />
                <span className="tiny muted">{b.ratingCount} reviews</span>
              </div>
            </div>

            {b.isNew && <span className="badge badge-new" style={{ marginTop: 10 }}>● Opened {daysAgo(b.openingDate)}</span>}

            <div className="row gap-12 small" style={{ marginTop: 12, color: "var(--ink-600)" }}>
              <span className="row gap-4"><MapPin size={14} /> {distanceLabel(b.distanceKm)}</span>
              <span className="row gap-4"><Clock size={14} color={evalRes.isOpenNow ? "var(--green-500)" : "var(--red-600)"} />
                <span style={{ color: evalRes.isOpenNow ? "var(--green-500)" : "var(--red-600)", fontWeight: 700 }}>{evalRes.isOpenNow ? "Open now" : "Closed"}</span>
              </span>
            </div>
            <p className="tiny muted" style={{ marginTop: 6 }}>{b.addressLine1}, {b.city} • {b.hours}</p>

            <div className="row wrap gap-6" style={{ marginTop: 14 }}>
              {b.tags.map((t) => <span key={t} className="badge badge-gray">{t}</span>)}
            </div>

            <div className="row gap-10" style={{ marginTop: 16 }}>
              {b.phone && b.showPhonePublicly !== false && <a href={`tel:${b.phone}`} className="btn btn-primary grow" onClick={() => businessService.recordInteraction(b.id, "CALL").catch(() => {})}><Phone size={17} /> Call</a>}
              <button
                className="btn btn-outline grow"
                onClick={() => {
                  businessService.recordInteraction(b.id, "DIRECTIONS").catch(() => {});
                  showToast("Opening Google Maps…");
                  const origin = user.lat && user.lng ? `${user.lat},${user.lng}` : "";
                  const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${b.lat},${b.lng}&travelmode=driving`;
                  window.open(mapsUrl, "_blank");
                }}
              >
                <Navigation size={17} /> Directions
              </button>
              {b.ownerUserId !== user.id && (
                <button
                  className="icon-btn"
                  style={{ background: "var(--brand-50)", color: "var(--brand-700)", width: 48, border: "1.5px solid var(--brand-200)" }}
                  title="Message"
                  onClick={async () => {
                    if (!b.ownerUserId) { showToast("Owner info unavailable"); return; }
                    try {
                      const conv = await chatService.getOrCreate(b.ownerUserId, {
                        type: "business", id: b.id, name: b.name, avatar: b.coverImage, ownerUserId: b.ownerUserId,
                      });
                      businessService.recordInteraction(b.id, "MESSAGE").catch(() => {});
                      nav(`/chat/${conv.id}`);
                    } catch (e: any) { showToast(e?.message || "Couldn't open chat. Try again."); }
                  }}
                >
                  <MessageCircle size={20} />
                </button>
              )}
            </div>

            {/* Follow + notify row */}
            <div className="row gap-10" style={{ marginTop: 12 }}>
              <button
                className="btn grow btn-sm"
                style={{ background: following ? "var(--brand-100)" : "var(--ink-50)", color: following ? "var(--brand-700)" : "var(--ink-700)" }}
                onClick={() => toggleFollow("BUSINESS", b.id, b.name)}
              >
                {following ? <><UserCheck size={16} /> Following</> : <><UserPlus size={16} /> Follow</>}
              </button>
              <button
                className="btn grow btn-sm"
                style={{ background: notifying ? "#fff3e8" : "var(--ink-50)", color: notifying ? "var(--accent-600)" : "var(--ink-700)" }}
                onClick={() => toggleNotify(notifyKey)}
              >
                <Bell size={16} fill={notifying ? "var(--orange-500)" : "none"} /> {notifying ? "Alerts on" : "Notify me"}
              </button>
              {isOwner ? (
                <button
                  className="btn grow btn-sm"
                  style={{ background: "var(--brand-50)", color: "var(--brand-700)", border: "1px solid var(--brand-200)" }}
                  onClick={() => nav(`/business/${b.id}/manage/appointments`)}
                >
                  <Clock size={16} /> View appointments
                </button>
              ) : (
                <button
                  className="btn grow btn-sm"
                  style={{ background: "var(--brand-50)", color: "var(--brand-700)", border: "1px solid var(--brand-200)" }}
                  onClick={() => setScheduling(true)}
                >
                  <Clock size={16} /> Book appointment
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Live queue */}
        {queue && queue.isOpen && (
          <div className="page-pad" style={{ paddingTop: 8, paddingBottom: 0 }}>
            <div className="card row gap-12" style={{ padding: 14, background: queue.peopleAhead === 0 ? "#e8f7ee" : "var(--brand-50)", border: "none" }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Users size={20} color={queue.peopleAhead === 0 ? "var(--green-500)" : "#cc4415"} />
              </div>
              <div className="grow">
                <div className="semi small">
                  {queue.peopleAhead === 0 ? "No wait right now 🎉" : `${queue.peopleAhead} people ahead`}
                </div>
                <div className="tiny muted">{queue.peopleAhead === 0 ? "Walk in anytime" : `~${queue.estWaitMin} min wait`}</div>
              </div>
              {inQueue ? (
                <span className="badge badge-green">You're #{queue.peopleAhead + 1}</span>
              ) : (
                <button
                  className="btn btn-primary btn-sm"
                  onClick={async () => {
                    try {
                      await businessService.joinQueueToken(b.id, safeName(user.name, "Customer"));
                      joinQueue(b.id);
                    } catch {
                      showToast("Sign in to join the queue");
                    }
                  }}
                >Join queue</button>
              )}
            </div>
          </div>
        )}

        {/* Offer strip */}
        {b.offers.length > 0 && (
          <div className="page-pad" style={{ paddingTop: 8, paddingBottom: 0 }}>
            {b.offers.map((o) => (
              <div key={o.id} className="card row gap-10" style={{ padding: 12, background: "#fff7ed", border: "1px dashed #fdba74" }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: "#ffedd5", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Tag size={18} color="var(--orange-500)" />
                </div>
                <div className="grow">
                  <div className="semi small" style={{ color: "#c2410c" }}>{o.title}</div>
                  <div className="tiny muted">{o.description}</div>
                </div>
                {o.code && <span className="badge badge-amber" style={{ borderStyle: "dashed", border: "1px dashed var(--amber-500)" }}>{o.code}</span>}
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="row page-pad" style={{ gap: 0, paddingBottom: 0, paddingTop: 12, borderBottom: "1px solid var(--line)", position: "sticky", top: 0, background: "var(--bg)", zIndex: 5 }}>
          {([["catalog", `Menu (${b.catalog.length})`], ["posts", `Posts (${(bizPosts ?? []).length})`], ["about", "About"], ["reviews", `Reviews`]] as const).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)} className="semi"
              style={{ flex: 1, padding: "10px 0", fontSize: 14, color: tab === t ? "var(--brand-700)" : "var(--ink-500)", borderBottom: tab === t ? "2.5px solid var(--brand-700)" : "2.5px solid transparent" }}>
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === "catalog" && (
          <div className="page-pad col gap-14" style={{ paddingTop: 18 }}>
            {b.catalog.length === 0 && (
              <div className="col center" style={{ padding: "32px 0", gap: 8 }}>
                <span style={{ fontSize: 32 }}>🛒</span>
                <span className="small muted">No items listed yet.</span>
              </div>
            )}
            {b.catalog.map((item) => {
              const qty = cart[item.id] ?? 0;
              return (
                <div key={item.id} className="card row gap-12" style={{ alignItems: "flex-start", padding: "14px 14px 18px" }}>
                  <div className="grow" style={{ minWidth: 0 }}>
                    {item.isVeg != null && <VegDot veg={item.isVeg} />}
                    {item.bestSeller && <span className="badge badge-amber" style={{ marginLeft: 6 }}>⭐ Bestseller</span>}
                    <div className="semi" style={{ marginTop: 4, fontSize: 15 }}>{item.name}</div>
                    <div className="row gap-6" style={{ marginTop: 2 }}>
                      <span className="bold">{inr(item.salePrice ?? item.price)}</span>
                      {item.salePrice && <span className="tiny muted" style={{ textDecoration: "line-through" }}>{inr(item.price)}</span>}
                    </div>
                    <p className="tiny muted clamp-2" style={{ marginTop: 4 }}>{item.description}</p>
                    {item.stockStatus === "OUT_OF_STOCK" && (
                      <div className="row gap-8" style={{ marginTop: 6 }}>
                        <span className="badge badge-red">Out of stock</span>
                        <button
                          className="tiny semi row gap-4"
                          style={{ color: notifySubs.includes(`STOCK:${item.id}`) ? "var(--accent-600)" : "var(--brand-700)" }}
                          onClick={() => toggleNotify(`STOCK:${item.id}`)}
                        >
                          <Bell size={12} /> {notifySubs.includes(`STOCK:${item.id}`) ? "Will notify" : "Notify me"}
                        </button>
                      </div>
                    )}
                    {item.stockStatus === "LIMITED" && <span className="badge badge-amber" style={{ marginTop: 6 }}>Few left</span>}
                    {!isOwner && item.stockStatus !== "OUT_OF_STOCK" && (
                      <button
                        className="btn btn-outline btn-sm"
                        style={{ marginTop: 8, fontSize: 11, padding: "4px 12px", color: "var(--brand-700)", borderColor: "var(--brand-200)", width: "fit-content" }}
                        onClick={() => { setSchedulingPkg({ id: item.id, name: item.name, price: item.salePrice ?? item.price }); setScheduling(true); }}
                      >📅 Book appointment</button>
                    )}
                  </div>
                  <div style={{ position: "relative", width: 110, flexShrink: 0 }}>
                    <SafeImg src={item.image} alt={item.name} className="thumb" style={{ width: 110, height: 96, borderRadius: 14 }} />
                    {qty === 0 ? (
                      <button
                        className="btn btn-sm"
                        style={{ position: "absolute", bottom: -10, left: "50%", transform: "translateX(-50%)", background: "#fff", color: "var(--green-600)", border: "1.5px solid var(--green-500)", boxShadow: "var(--shadow-sm)", fontWeight: 800, padding: "6px 18px" }}
                        disabled={item.stockStatus === "OUT_OF_STOCK"}
                        onClick={() => add(item.id, 1)}
                      >
                        ADD
                      </button>
                    ) : (
                      <div className="row" style={{ position: "absolute", bottom: -10, left: "50%", transform: "translateX(-50%)", background: "var(--green-500)", borderRadius: 10, color: "#fff", boxShadow: "var(--shadow-sm)" }}>
                        <button style={{ padding: "6px 9px", color: "#fff" }} onClick={() => add(item.id, -1)}><Minus size={14} /></button>
                        <span className="bold" style={{ minWidth: 18, textAlign: "center" }}>{qty}</span>
                        <button style={{ padding: "6px 9px", color: "#fff" }} onClick={() => add(item.id, 1)}><Plus size={14} /></button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === "posts" && (
          <div className="page-pad col gap-12" style={{ paddingTop: 18 }}>
            {(bizPosts ?? []).length === 0 ? (
              <EmptyState emoji="📣" title="No posts yet" text="This business hasn't posted to the community yet." />
            ) : (
              (bizPosts ?? []).map((p) => (
                <button
                  key={p.id}
                  className="card col gap-6"
                  style={{ padding: 14, textAlign: "left" }}
                  onClick={() => nav(`/community/${p.id}`, { state: { post: p } })}
                >
                  <div className="row between">
                    <span className="semi small">{p.title || p.type}</span>
                    <span className="tiny muted">{p.postedAt}</span>
                  </div>
                  {p.body && <p className="small muted clamp-2" style={{ lineHeight: 1.5 }}>{p.body}</p>}
                  {p.image && <SafeImg src={p.image} style={{ width: "100%", height: 150, borderRadius: 12, objectFit: "cover" }} />}
                  <div className="row gap-14 tiny muted" style={{ marginTop: 2 }}>
                    <span className="row gap-4"><Heart size={13} /> {p.likes}</span>
                    <span className="row gap-4"><MessageCircle size={13} /> {p.commentsCount}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        )}

        {tab === "about" && (
          <div className="page-pad col gap-16" style={{ paddingTop: 18 }}>
            {b.description && <p className="small" style={{ lineHeight: 1.7, color: "var(--ink-700)" }}>{b.description}</p>}
            <div className="card col gap-10" style={{ padding: 16 }}>
              <div className="small semi" style={{ marginBottom: 6 }}>Hours</div>
              <div className="row between small" style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}><span className="muted">Mon – Sun</span><span className="semi">{b.hours}</span></div>
              <div className="small semi" style={{ marginTop: 10, marginBottom: 6 }}>Address</div>
              <p className="small muted" style={{ lineHeight: 1.5 }}>{b.addressLine1}, {b.city} – {b.pincode}</p>
            </div>
            {/* Real location map — one tap opens turn-by-turn directions */}
            <MiniMap lat={b.lat} lng={b.lng} pinColor="var(--orange-500)" label={b.addressLine1 || b.city} />

            {/* Q&A */}
            <div>
              <div className="semi small row gap-6" style={{ marginBottom: 8 }}><HelpCircle size={15} color="#6366f1" /> Questions & Answers</div>
              <div className="card card-condensed">
                <textarea
                  className="input"
                  placeholder="Ask the owner a question…"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  style={{ minHeight: 56 }}
                />
                <button className="btn btn-primary btn-sm btn-block" style={{ marginTop: 8 }} disabled={question.trim().length < 5 || askingNow} onClick={submitQuestion}>
                  {askingNow ? "Sending…" : "Ask question"}
                </button>
              </div>
              {(qnaList ?? []).filter((q) => q.answer).length > 0 && (
                <div className="col gap-10" style={{ marginTop: 10 }}>
                  {(qnaList ?? []).filter((q) => q.answer).map((q) => (
                    <div key={q.id} className="card card-condensed">
                      <div className="row between">
                        <span className="semi small">{q.askerName}</span>
                        <span className="tiny muted">{q.askedAt}</span>
                      </div>
                      <p className="small" style={{ marginTop: 4 }}>{q.question}</p>
                      <div className="card card-condensed" style={{ marginTop: 8, background: "var(--brand-50)", border: "none" }}>
                        <div className="tiny semi" style={{ color: "var(--brand-700)", marginBottom: 2 }}>Owner</div>
                        <p className="small">{q.answer}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "reviews" && (
          <div className="page-pad col gap-14" style={{ paddingTop: 18 }}>
            <button className="btn btn-outline btn-block" onClick={() => setReviewing(true)}>
              <Star size={16} /> Write a Review
            </button>
            <div className="card row gap-16" style={{ padding: 18 }}>
              <div className="col center">
                <span className="bold" style={{ fontSize: 34, lineHeight: 1 }}>{b.ratingAvg}</span>
                <StarRow value={b.ratingAvg} size={13} />
                <span className="tiny muted" style={{ marginTop: 2 }}>{b.ratingCount} ratings</span>
              </div>
              <div className="grow col gap-4">
                {[5, 4, 3, 2, 1].map((s) => {
                  // Real distribution from the loaded reviews; empty when none.
                  const total = (reviews ?? []).length;
                  const pct = total === 0 ? 0 : Math.round(((reviews ?? []).filter((rv) => Math.round(rv.rating) === s).length / total) * 100);
                  return (
                    <div key={s} className="row gap-6 tiny">
                      <span style={{ width: 8 }}>{s}</span>
                      <Star size={10} fill="var(--amber-500)" strokeWidth={0} />
                      <div style={{ flex: 1, height: 6, background: "var(--ink-100)", borderRadius: 6, overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: "var(--amber-500)" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            {(reviews ?? []).length === 0 && (
              <EmptyState emoji="⭐" title="No reviews yet" text="Be the first to leave a review!" />
            )}
            {(reviews ?? []).map((rv) => (
              <div key={rv.id} className="card row gap-12" style={{ alignItems: "flex-start", padding: "14px 14px" }}>
                <SafeImg src={rv.raterAvatar} variant="avatar" className="avatar" style={{ width: 40, height: 40, flexShrink: 0 }} />
                <div className="grow">
                  <div className="row between"><span className="semi small">{rv.raterName}</span><span className="tiny muted">{rv.date}</span></div>
                  <StarRow value={rv.rating} size={12} />
                  <p className="small" style={{ marginTop: 6, lineHeight: 1.55 }}>{rv.comment}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="page-pad">
          <button className="row gap-6 tiny muted center" style={{ width: "100%", padding: 10 }} onClick={() => setReport(true)}>
            <Flag size={13} /> Report this business
          </button>
        </div>
      </div>

      {/* Cart bar */}
      {cartCount > 0 && (
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: 14, zIndex: 30 }}>
          <button
            className="btn btn-green btn-block row between"
            style={{ boxShadow: "var(--shadow-lg)" }}
            onClick={checkout}
          >
            <span>{cartCount} item{cartCount > 1 ? "s" : ""} • {inr(cartTotal)}</span>
            <span className="row gap-4">Checkout <ArrowLeft size={16} style={{ transform: "rotate(180deg)" }} /></span>
          </button>
        </div>
      )}

      {report && <ReportSheet targetType="BUSINESS" targetId={b.id} name={b.name} onClose={() => setReport(false)} />}
      {share && <ShareCard title={b.name} subtitle={b.subCategory} image={b.coverImage} meta={`${b.ratingCount > 0 ? `⭐ ${b.ratingAvg} (${b.ratingCount}) • ` : ""}${b.city}`} url={window.location.origin + "/business/" + b.id} onClose={() => setShare(false)} />}
      {addList && <AddToListSheet type="BUSINESS" id={b.id} onClose={() => setAddList(false)} />}
      {reviewing && (
        <ReviewSheet
          targetName={b.name}
          onSubmit={async (rating, comment) => {
            await businessService.addReview(b.id, rating, comment);
            refetch();
            refetchReviews();
          }}
          onClose={() => setReviewing(false)}
        />
      )}
      {scheduling && (
        <AppointmentSheet
          targetId={b.id}
          targetName={b.name}
          targetType="BUSINESS"
          availabilityNote={b.hours || DEFAULT_WORKING_HOURS}
          availableNow={evalRes.isOpenNow}
          packages={
            checkoutMode && schedulingPkg
              ? [schedulingPkg]
              : (b.catalog ?? []).map((it) => ({ id: it.id, name: it.name, price: it.salePrice ?? it.price }))
          }
          initialPackage={schedulingPkg}
          initialNotes={checkoutMode ? checkoutNotes : undefined}
          paymentTiming={b.paymentTiming}
          payeeUpiId={b.upiId}
          onBooked={() => { if (checkoutMode) setCart({}); }}
          onClose={() => { setScheduling(false); setSchedulingPkg(null); setCheckoutMode(false); setCheckoutNotes(""); }}
        />
      )}
    </div>
  );
}

function daysAgo(iso: string) {
  const days = Math.round((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}
