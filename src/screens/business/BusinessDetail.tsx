import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Heart, Share2, Phone, Navigation, Clock, MapPin,
  BadgeCheck, Star, Plus, Minus, Tag, MessageCircle, Flag,
  Bookmark, Bell, UserPlus, UserCheck, Users, Stamp, ArrowRight, HelpCircle,
} from "lucide-react";
import { businessService } from "@/services";
import { chatService } from "@/services/chatService";
import ReviewSheet from "@/components/ReviewSheet";
import { useQuery } from "@/hooks/useApi";
import { Skeleton, ErrorView } from "@/components/states";
import { Rating, StarRow, VegDot, EmptyState, SafeImg, inr } from "@/components/common";
import { useApp } from "@/store";
import ReportSheet from "@/components/ReportSheet";
import ShareCard from "@/components/ShareCard";
import AddToListSheet from "@/components/AddToListSheet";

export default function BusinessDetail() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { data: b, loading, error, refetch } = useQuery(() => businessService.get(id), [id]);
  const { data: reviews, refetch: refetchReviews } = useQuery(() => businessService.reviews(id), [id]);
  const { data: queue } = useQuery(() => businessService.queue(id), [id]);
  const { data: loyalty } = useQuery(() => businessService.loyaltyCard(id), [id]);
  const { data: qnaList, refetch: refetchQna } = useQuery(() => businessService.qna(id), [id]);
  const {
    user,
    isBookmarked, toggleBookmark, showToast,
    isFollowing, toggleFollow, notifySubs, toggleNotify,
    queuesJoined, joinQueue,
  } = useApp();
  const [tab, setTab] = useState<"catalog" | "about" | "reviews">("catalog");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [report, setReport] = useState(false);
  const [share, setShare] = useState(false);
  const [addList, setAddList] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [question, setQuestion] = useState("");
  const [askingNow, setAskingNow] = useState(false);

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

  return (
    <div className="screen" style={{ position: "relative" }}>
      <div className="screen-scroll" style={{ paddingBottom: cartCount ? 88 : 24 }}>
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
                <Heart size={18} fill={saved ? "#ef4444" : "none"} color={saved ? "#ef4444" : "#5c5573"} />
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
          <div className="card" style={{ padding: 16 }}>
            <div className="row between" style={{ alignItems: "flex-start" }}>
              <div style={{ minWidth: 0 }}>
                <div className="row gap-6">
                  <h1 className="bold" style={{ fontSize: 21 }}>{b.name}</h1>
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
              <span className="row gap-4"><MapPin size={14} /> {b.distanceKm} km</span>
              <span className="row gap-4"><Clock size={14} color={b.isOpenNow ? "#16a34a" : "#dc2626"} />
                <span style={{ color: b.isOpenNow ? "#16a34a" : "#dc2626", fontWeight: 700 }}>{b.isOpenNow ? "Open now" : "Closed"}</span>
              </span>
            </div>
            <p className="tiny muted" style={{ marginTop: 6 }}>{b.addressLine1}, {b.city} • {b.hours}</p>

            <div className="row wrap gap-6" style={{ marginTop: 12 }}>
              {b.tags.map((t) => <span key={t} className="badge badge-gray">{t}</span>)}
            </div>

            <div className="row gap-10" style={{ marginTop: 14 }}>
              <a href={`tel:${b.phone}`} className="btn btn-primary grow" onClick={() => businessService.recordInteraction(b.id, "CALL").catch(() => {})}><Phone size={17} /> Call</a>
              <button className="btn btn-outline grow" onClick={() => { businessService.recordInteraction(b.id, "DIRECTIONS").catch(() => {}); showToast("Opening directions…"); }}><Navigation size={17} /> Directions</button>
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
                      nav(`/chat/${conv.id}`);
                    } catch (e: any) { showToast(e?.message || "Couldn't open chat. Try again."); }
                  }}
                >
                  <MessageCircle size={20} />
                </button>
              )}
            </div>

            {/* Follow + notify row */}
            <div className="row gap-10" style={{ marginTop: 10 }}>
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
                <Bell size={16} fill={notifying ? "#f26a00" : "none"} /> {notifying ? "Alerts on" : "Notify me"}
              </button>
            </div>
          </div>
        </div>

        {/* Live queue */}
        {queue && queue.isOpen && (
          <div className="page-pad" style={{ paddingTop: 8, paddingBottom: 0 }}>
            <div className="card row gap-12" style={{ padding: 14, background: queue.peopleAhead === 0 ? "#e8f7ee" : "var(--brand-50)", border: "none" }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Users size={20} color={queue.peopleAhead === 0 ? "#16a34a" : "#cc4415"} />
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
                      await businessService.joinQueueToken(b.id, user.name);
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

        {/* Loyalty card */}
        {loyalty && (
          <div className="page-pad" style={{ paddingTop: 8, paddingBottom: 0 }}>
            <button className="card row gap-12" style={{ padding: 14, width: "100%", textAlign: "left" }} onClick={() => nav("/wallet")}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: "var(--brand-50)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Stamp size={20} color="#cc4415" />
              </div>
              <div className="grow">
                <div className="semi small">Loyalty card • {loyalty.stamps}/{loyalty.target} stamps</div>
                <div className="tiny muted">{loyalty.target - loyalty.stamps} more for {loyalty.reward}</div>
              </div>
              <span className="see-all">Open →</span>
            </button>
          </div>
        )}

        {/* Offer strip */}
        {b.offers.length > 0 && (
          <div className="page-pad" style={{ paddingTop: 8, paddingBottom: 0 }}>
            {b.offers.map((o) => (
              <div key={o.id} className="card row gap-10" style={{ padding: 12, background: "#fff7ed", border: "1px dashed #fdba74" }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: "#ffedd5", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Tag size={18} color="#f26a00" />
                </div>
                <div className="grow">
                  <div className="semi small" style={{ color: "#c2410c" }}>{o.title}</div>
                  <div className="tiny muted">{o.description}</div>
                </div>
                {o.code && <span className="badge badge-amber" style={{ borderStyle: "dashed", border: "1px dashed #f59e0b" }}>{o.code}</span>}
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="row page-pad" style={{ gap: 0, paddingBottom: 0, paddingTop: 16, borderBottom: "1px solid var(--line)", position: "sticky", top: 0, background: "var(--bg)", zIndex: 5 }}>
          {([["catalog", `Menu (${b.catalog.length})`], ["about", "About"], ["reviews", `Reviews`]] as const).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)} className="semi"
              style={{ flex: 1, padding: "10px 0", fontSize: 14, color: tab === t ? "var(--brand-700)" : "var(--ink-500)", borderBottom: tab === t ? "2.5px solid var(--brand-700)" : "2.5px solid transparent" }}>
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === "catalog" && (
          <div className="page-pad col gap-12">
            {b.catalog.map((item) => {
              const qty = cart[item.id] ?? 0;
              return (
                <div key={item.id} className="row gap-12" style={{ alignItems: "flex-start" }}>
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

        {tab === "about" && (
          <div className="page-pad col gap-14">
            <p className="small" style={{ lineHeight: 1.6 }}>{b.description}</p>
            <div className="card" style={{ padding: 14 }}>
              <div className="semi small" style={{ marginBottom: 8 }}>Hours</div>
              <div className="row between small"><span className="muted">Mon – Sun</span><span className="semi">{b.hours}</span></div>
              <div className="divider" />
              <div className="semi small" style={{ marginBottom: 8 }}>Address</div>
              <p className="small muted">{b.addressLine1}, {b.city} – {b.pincode}</p>
            </div>
            <div
              style={{ height: 130, borderRadius: 16, background: "linear-gradient(120deg,#eef1f5,#e3f2fd)", position: "relative", overflow: "hidden" }}
              onClick={() => nav("/map")}
            >
              <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-100%)" }}>
                <MapPin size={36} color="#f26a00" fill="#f26a00" />
              </div>
              <span className="tiny semi" style={{ position: "absolute", bottom: 10, right: 12, background: "#fff", padding: "4px 10px", borderRadius: 8 }}>Open in map</span>
            </div>

            {/* Q&A */}
            <div>
              <div className="semi small row gap-6" style={{ marginBottom: 8 }}><HelpCircle size={15} color="#6366f1" /> Questions & Answers</div>
              <div className="card" style={{ padding: 12 }}>
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
                    <div key={q.id} className="card" style={{ padding: 12 }}>
                      <div className="row between">
                        <span className="semi small">{q.askerName}</span>
                        <span className="tiny muted">{q.askedAt}</span>
                      </div>
                      <p className="small" style={{ marginTop: 4 }}>{q.question}</p>
                      <div className="card" style={{ padding: 10, marginTop: 8, background: "var(--brand-50)", border: "none" }}>
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
          <div className="page-pad col gap-14">
            <button className="btn btn-outline btn-block" onClick={() => setReviewing(true)}>
              <Star size={16} /> Write a Review
            </button>
            <div className="card row gap-16" style={{ padding: 16 }}>
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
                      <Star size={10} fill="#f59e0b" strokeWidth={0} />
                      <div style={{ flex: 1, height: 6, background: "var(--ink-100)", borderRadius: 6, overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: "#f59e0b" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            {(reviews ?? []).map((rv) => (
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
            onClick={() => showToast("Checkout & in-app pay arrive in V3 — call the shop to order!")}
          >
            <span>{cartCount} item{cartCount > 1 ? "s" : ""} • {inr(cartTotal)}</span>
            <span className="row gap-4">Next <ArrowLeft size={16} style={{ transform: "rotate(180deg)" }} /></span>
          </button>
        </div>
      )}

      {report && <ReportSheet targetType="BUSINESS" targetId={b.id} name={b.name} onClose={() => setReport(false)} />}
      {share && <ShareCard title={b.name} subtitle={`${b.subCategory} • ${b.distanceKm} km`} image={b.coverImage} meta={`⭐ ${b.ratingAvg} (${b.ratingCount}) • ${b.city}`} url={window.location.origin + "/business/" + b.id} onClose={() => setShare(false)} />}
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
    </div>
  );
}

function daysAgo(iso: string) {
  const days = Math.round((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}
