import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Share2, MapPin, Clock, Eye, Zap, BadgeCheck,
  Flag, CheckCircle2, Send, Users, Flame, Repeat, MessageCircle, ArrowRightLeft,
  Edit3, Trash2, XCircle, X, Lock, Ticket, ChevronRight
} from "@/components/Icons";
import { requestService, chatService } from "@/services";
import { useQuery, useQueryWithRealtime } from "@/hooks/useApi";
import { Skeleton, ErrorView } from "@/components/states";
import { Rating, EmptyState, SafeImg, inr } from "@/components/common";
import { useApp } from "@/store";
import GuestSignInPrompt from "@/components/GuestSignInPrompt";
import ReportSheet from "@/components/ReportSheet";
import ShareCard from "@/components/ShareCard";
import { PLACEHOLDER_REQUEST_SHARE } from "@/lib/placeholders";
import { getSupabase, hasSupabaseEnv } from "@/lib/supabaseClient";
import type { Proposal, ProposalCounter } from "@/types";
import { openProfile } from "@/lib/profileSheet";
import { GROUP_BUY_PROGRESS_ENABLED } from "@/utils/constants";
import { poolProgress } from "@/lib/groupBuy";
import { REQUEST_STATUS_BADGE, PROPOSAL_STATUS_BADGE } from "@/lib/statusBadges";
import { haptics } from "@/lib/haptics";
import AnimatedNumber from "@/components/AnimatedNumber";
import { useI18n } from "@/lib/i18n";

export default function RequestDetail() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { user, showToast, meToos, isAuthed, isGuest } = useApp();
  const { t, tf } = useI18n();
  const { data: r, loading, error, refetch } = useQueryWithRealtime(
    async () => {
      const req = await requestService.get(id, user.lat || 0, user.lng || 0);
      if (!req?.isGroupBuy) return req;
      // Pool totals aren't on the requests row (me_too_count counts people,
      // not pledged units), so they're fetched alongside for group buys only.
      const pledges = await requestService.groupBuyPledges(id);
      return { ...req, ...pledges };
    },
    "requests",
    [id],
    `id=eq.${id}`
  );

  // proposals is a separate table from requests, so the row-level subscription
  // above doesn't cover a new proposal landing — subscribe to it too.
  useEffect(() => {
    if (!hasSupabaseEnv || !id) return;
    const sb = getSupabase();
    const channel = sb
      .channel(`rt:proposals:${id}`)
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "proposals", filter: `request_id=eq.${id}` }, () => refetch())
      .subscribe();
    return () => { sb.removeChannel(channel); };
    // refetch is a new closure every render (useQueryWithRealtime doesn't
    // memoize it) — depending on it here would tear down and resubscribe
    // this realtime channel on every render instead of only when `id` changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  const [report, setReport] = useState(false);
  const [share, setShare] = useState(false);
  const [accepted, setAccepted] = useState<string | null>(null);
  const [propSort, setPropSort] = useState<"best" | "price" | "rating">("best");
  const [messaging, setMessaging] = useState<string | null>(null);
  const [counterFor, setCounterFor] = useState<string | null>(null);
  const [counterAmt, setCounterAmt] = useState("");
  const [counterBackFor, setCounterBackFor] = useState<string | null>(null);
  const [counterBackAmt, setCounterBackAmt] = useState("");
  const [counterBusy, setCounterBusy] = useState<string | null>(null);

  // CRUD Edit / Delete state for owner
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editMinBudget, setEditMinBudget] = useState("");
  const [editMaxBudget, setEditMaxBudget] = useState("");
  const [editUrgent, setEditUrgent] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  if (loading) {
    return (
      <div className="screen">
        <div className="page-pad col gap-12" style={{ marginTop: 16 }}>
          <Skeleton h={44} w="70%" />
          <Skeleton h={120} mb={0} />
          <Skeleton h={80} mb={0} />
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

  if (!r) {
    return (
      <div className="screen">
        <EmptyState emoji="📋" title={t("request_not_found")} text={t("request_not_found_desc")} />
      </div>
    );
  }

  const isMine = r.requesterUserId === user.id;
  const budget = r.budgetMin && r.budgetMax ? `${inr(r.budgetMin)} – ${inr(r.budgetMax)}` : t("open_budget");
  // Let the customer compare offers the way they think: promoted-first by
  // default, or by lowest quote / highest-rated when weighing options.
  const sortedProposals = [...r.proposals].sort((a, b) => {
    if (propSort === "price") return a.price - b.price;
    if (propSort === "rating") return (b.responderRating ?? 0) - (a.responderRating ?? 0);
    return Number(b.isBoosted) - Number(a.isBoosted);
  });

  async function messageResponder(p: Proposal) {
    if (!p.responderUserId) { showToast("Can't message this responder"); return; }
    setMessaging(p.id);
    try {
      const subjectType = p.responderType === "business" ? "business" : p.responderType === "provider" ? "provider" : "user";
      const conv = await chatService.getOrCreate(p.responderUserId, {
        type: subjectType as any, id: p.responderUserId, name: p.responderName, avatar: p.responderAvatar, ownerUserId: p.responderUserId,
      });
      nav(`/chat/${conv.id}`);
    } catch (e: any) {
      showToast(e?.message || "Couldn't open chat. Try again.");
    } finally {
      setMessaging(null);
    }
  }
  const meTooed = meToos.includes(r.id) || r.meTooed;
  const meTooCount = (r.meTooCount ?? 0) + (meTooed && !r.meTooed ? 1 : 0);

  /** Closing a group buy mints one claim pass per pooled member. Deliberately
   *  non-fatal: the agreement is already committed by the time this runs, so a
   *  failure here must not read as "accepting failed" — the initiator can
   *  retry issuance (the RPC is idempotent) rather than being left unsure
   *  whether they accepted at all. */
  async function issueTokensIfGroupBuy(agreementId: string | null, p: Proposal, unitPrice?: number) {
    // Re-checked inside the closure: TS can't carry the outer narrowing of `r`
    // across a function boundary, and this runs async after an await anyway.
    if (!agreementId || !r || !r.isGroupBuy) return;
    try {
      const count = await requestService.issueGroupBuyTokens(r.id, agreementId, {
        businessId: p.responderEntityId ?? null,
        unitPrice: unitPrice ?? p.price,
      });
      if (count > 0) showToast(`${count} claim pass${count > 1 ? "es" : ""} issued to the group`);
    } catch {
      showToast("Deal accepted, but passes couldn't be issued — open the agreement to retry.");
    }
  }

  async function acceptProposal(p: Proposal) {
    setAccepted(p.id);
    haptics.medium();
    try {
      const result = await requestService.acceptProposal(p.id);
      haptics.success();
      showToast(`Accepted ${p.responderName}'s offer`);
      await issueTokensIfGroupBuy(result.agreementId, p);
      setTimeout(() => nav(result.agreementId ? `/agreement/${result.agreementId}` : `/agreements`), 700);
    } catch {
      setAccepted(null);
      showToast("Couldn't accept proposal. Try again.");
    }
  }

  // Accept only the latest responder-authored counter by immutable ID. The
  // server locks the request/proposal/counter and derives the agreed amount.
  async function acceptCounter(p: Proposal, counter: ProposalCounter) {
    setAccepted(p.id);
    haptics.medium();
    try {
      const result = await requestService.acceptProposalCounter(p.id, counter.id);
      haptics.success();
      showToast(`Accepted at ${inr(counter.amount)}`);
      await issueTokensIfGroupBuy(result.agreementId, p, counter.amount);
      setTimeout(() => nav(result.agreementId ? `/agreement/${result.agreementId}` : `/agreements`), 700);
    } catch {
      setAccepted(null);
      showToast("Couldn't accept. Try again.");
    }
  }

  async function sendCounter(p: Proposal) {
    if (!counterAmt || counterBusy) return;
    setCounterBusy(p.id);
    haptics.medium();
    try {
      await requestService.submitCounter(p.id, Number(counterAmt));
      showToast(`Counter offer of ${inr(Number(counterAmt))} sent`);
      setCounterFor(null);
      setCounterAmt("");
      refetch();
    } catch {
      showToast("Couldn't send counter. Try again.");
    } finally {
      setCounterBusy(null);
    }
  }

  async function sendCounterBack(p: Proposal) {
    if (!counterBackAmt || counterBusy) return;
    setCounterBusy(p.id);
    haptics.medium();
    try {
      await requestService.submitCounter(p.id, Number(counterBackAmt));
      showToast(`Your counter of ${inr(Number(counterBackAmt))} sent`);
      setCounterBackFor(null);
      setCounterBackAmt("");
      refetch();
    } catch {
      showToast("Couldn't send counter. Try again.");
    } finally {
      setCounterBusy(null);
    }
  }

  function startEdit() {
    if (!r) return;
    setEditTitle(r.title);
    setEditDesc(r.description);
    setEditMinBudget(r.budgetMin ? String(r.budgetMin) : "");
    setEditMaxBudget(r.budgetMax ? String(r.budgetMax) : "");
    setEditUrgent(!!r.isUrgent);
    setEditing(true);
  }

  async function handleSaveEdit() {
    if (!r || !editTitle.trim()) return;
    setUpdating(true);
    try {
      await requestService.update(r.id, {
        title: editTitle.trim(),
        description: editDesc.trim(),
        budgetMin: editMinBudget ? Number(editMinBudget) : undefined,
        budgetMax: editMaxBudget ? Number(editMaxBudget) : undefined,
        isUrgent: editUrgent,
      });
      showToast("Request updated successfully");
      setEditing(false);
      refetch();
    } catch {
      showToast("Failed to update request");
    } finally {
      setUpdating(false);
    }
  }

  async function handleDeleteRequest() {
    if (!r) return;
    setDeleting(true);
    try {
      await requestService.delete(r.id);
      showToast("Request cancelled and removed");
      nav(-1);
    } catch {
      showToast("Failed to delete request");
      setDeleting(false);
    }
  }

  return (
    <div className="screen" style={{ position: "relative" }}>
      <header className="appbar">
        <button className="icon-btn" onClick={() => nav(-1)}><ArrowLeft size={20} /></button>
        <span className="grow bold" style={{ fontSize: 16 }}>{t("request_header")}</span>
        {!isGuest && <button className="icon-btn" onClick={() => setShare(true)}><Share2 size={18} /></button>}
      </header>

      <div className="screen-scroll" style={{ paddingBottom: isMine ? 24 : 92 }}>
        <div className="page-pad">
          {/* Requester */}
          <div className="row gap-10">
            <SafeImg
              src={r.requesterAvatar}
              variant="avatar"
              className="avatar"
              style={{ width: 44, height: 44, cursor: r.requesterUserId ? "pointer" : undefined }}
              onClick={r.requesterUserId ? () => openProfile(r.requesterUserId!, "USER", { name: r.requesterName, avatar: r.requesterAvatar }) : undefined}
            />
            <div className="grow">
              <div className="row gap-6"><span className="semi">{r.requesterName}</span><Rating value={r.requesterRating} size={10} /></div>
              <span className="tiny muted row gap-4"><MapPin size={12} /> {r.area}{r.distanceKm > 0 ? ` • ${r.distanceKm} km` : ""} • {r.postedAt}</span>
            </div>
            {REQUEST_STATUS_BADGE[r.status] && (
              <span className={`badge ${REQUEST_STATUS_BADGE[r.status]!.cls}`}>{REQUEST_STATUS_BADGE[r.status]!.label}</span>
            )}
          </div>

          {r.status === "OPEN" && r.expiresAt && <ExpiryCountdown expiresAt={r.expiresAt} />}

          {/* Owner Management Controls (CRUD) */}
          {isMine && (
            <div className="row gap-8" style={{ marginTop: "var(--space-sm)", background: "var(--ink-50)", padding: "var(--space-xs)", borderRadius: 12 }}>
              <button className="btn btn-outline btn-sm grow row center gap-6" onClick={startEdit}>
                <Edit3 size={14} /> {t("edit_request")}
              </button>
              <button className="btn btn-outline btn-sm row center gap-6" style={{ color: "var(--red-500)", borderColor: "var(--red-100)" }} onClick={() => setShowDeleteConfirm(true)}>
                <Trash2 size={14} /> {t("delete_action")}
              </button>
            </div>
          )}

          {/* Title + meta */}
          <div className="row wrap gap-6" style={{ marginTop: 16 }}>
            {r.isUrgent && <span className="badge badge-red"><Flame size={11} /> {t("urgent_badge")}</span>}
            {r.isBoosted && <span className="badge badge-amber"><Zap size={11} /> {t("boosted_badge")}</span>}
            {r.isGroupBuy && <span className="badge badge-green"><Users size={11} /> {t("group_buy_badge")}</span>}
            {r.isRecurring && <span className="badge badge-blue"><Repeat size={11} /> {t("recurring_badge")}</span>}
            <span className="badge badge-purple">{r.categoryName}</span>
            {r.subCategory && <span className="badge badge-gray">{r.subCategory}</span>}
            {r.expiresInHrs && <span className="badge badge-gray"><Clock size={11} /> {tf("expires_in_hrs", { h: r.expiresInHrs })}</span>}
          </div>
          <h1 className="bold h1" style={{ marginTop: 8 }}>{r.title}</h1>
          <p className="small" style={{ marginTop: "var(--space-xs)", lineHeight: 1.6, color: "var(--ink-700)" }}>{r.description}</p>

          {r.photos.length > 0 && (
            <div className="row gap-8" style={{ marginTop: "var(--space-sm)", overflowX: "auto" }}>
              {r.photos.map((ph, i) => (
                <SafeImg key={i} src={ph} className="thumb" style={{ width: 120, height: 120, borderRadius: 14, flexShrink: 0 }} />
              ))}
            </div>
          )}

          {/* Group buy progress — hidden while GROUP_BUY_PROGRESS_ENABLED is off.
              Measured in UNITS pledged, not heads — see lib/groupBuy.ts. */}
          {GROUP_BUY_PROGRESS_ENABLED && r.isGroupBuy && (() => {
            const progress = poolProgress({
              target: r.groupBuyTarget,
              pledgedQuantity: r.pledgedQuantity,
              meTooCount,
              myPledgeQuantity: r.myPledgeQuantity,
            });
            if (!progress.hasTarget) return null;
            return (
              <div className="card" style={{ marginTop: 14, background: "var(--green-100)", border: "1px solid var(--green-500)" }}>
                <div className="row between tiny" style={{ marginBottom: 6 }}>
                  <span className="semi" style={{ color: "var(--green-600)" }}>{tf("pledged_of_target", { pledged: progress.pledged, target: progress.target })}</span>
                  <span className="muted">{progress.complete ? t("target_reached") : tf("more_unlocks_bulk_price", { n: progress.remaining })}</span>
                </div>
                <div style={{ height: 8, borderRadius: 6, background: "var(--surface)", overflow: "hidden" }}>
                  <div style={{ width: `${progress.pct}%`, height: "100%", background: "var(--green-500)", transition: "width .3s" }} />
                </div>
                {(r.myPledgeQuantity ?? 0) > 0 && (
                  <div className="tiny" style={{ color: "var(--green-600)", marginTop: 6 }}>
                    {t("you_pledged_prefix")} {r.myPledgeQuantity} {(r.myPledgeQuantity ?? 0) > 1 ? t("units_word") : t("unit_word")}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Once the initiator closes the deal, every joiner's pass lives at
              /community/activity. Surfaced here too because this is the screen
              they were watching while the pool filled. */}
          {r.isGroupBuy && r.groupAgreementId && (
            <button
              className="card row gap-10 center-v"
              style={{ marginTop: 14, padding: 14, width: "100%", textAlign: "left", background: "var(--brand-50)", border: "1px solid var(--brand-200)" }}
              onClick={() => nav("/community/activity")}
            >
              <Ticket size={20} color="var(--brand-700)" style={{ flexShrink: 0 }} />
              <div className="grow">
                <div className="semi small" style={{ color: "var(--brand-700)" }}>{t("deal_closed_ready")}</div>
                <div className="tiny muted" style={{ marginTop: 1 }}>{t("open_my_activity")}</div>
              </div>
              <ChevronRight size={16} color="var(--brand-300)" />
            </button>
          )}

          {/* Detail card */}
          <div className="card row" style={{ padding: 14, marginTop: 14 }}>
            <Cell label={t("budget_label")} value={budget} color="var(--green-500)" />
            <Sep />
            <Cell label={t("needed_by")} value={r.deadline} />
            <Sep />
            <Cell label={t("radius_label")} value={`${r.radiusKm} km`} />
          </div>
          <div className="row gap-12 tiny muted" style={{ marginTop: 10 }}>
            <span className="row gap-4"><Eye size={12} /> {tf("views_suffix", { n: r.viewCount })}</span>
            {/* proposalCount, not proposals.length — proposals are RLS-scoped
                to the requester and each responder, so the array is nearly
                empty for everyone else. The count is the public aggregate. */}
            <span className="row gap-4"><Clock size={12} /> {tf("proposals_suffix", { n: r.proposalCount ?? r.proposals.length })}</span>
          </div>
        </div>

        <div className="divider" />

        {/* Proposals */}
        <div className="page-pad" style={{ paddingTop: 0 }}>
          <h3 className="bold h2" style={{ marginBottom: 12 }}>
            {isMine ? t("offers_received") : t("offers_label")} ({r.proposalCount ?? r.proposals.length})
          </h3>

          {/* On a group buy, quoting is private by design — say so, so a
              neighbour who joined doesn't read the empty list as "nobody has
              quoted" when in fact several have. */}
          {r.isGroupBuy && !isMine && (r.proposalCount ?? 0) > 0 && r.proposals.length === 0 && (
            <div className="card row gap-10" style={{ padding: 12, marginBottom: 12, background: "var(--brand-50)", border: "1px solid var(--brand-200)" }}>
              <Lock size={16} color="var(--brand-700)" style={{ flexShrink: 0, marginTop: 1 }} />
              <div className="tiny" style={{ color: "var(--brand-700)", lineHeight: 1.5 }}>
                {(r.proposalCount ?? 0) > 1
                  ? tf("group_buy_privacy_other", { count: r.proposalCount ?? 0, name: r.requesterName })
                  : tf("group_buy_privacy_one", { name: r.requesterName })}
              </div>
            </div>
          )}

          {/* Sort — helps the customer compare when several offers arrive */}
          {r.proposals.length > 1 && (
            <div className="row gap-8" style={{ marginBottom: 12 }}>
              {([["best", t("sort_best")], ["price", t("sort_lowest_price")], ["rating", t("sort_top_rated")]] as [typeof propSort, string][]).map(([key, label]) => (
                <button
                  key={key}
                  className="chip"
                  style={{
                    padding: "5px 12px", fontSize: 12.5,
                    background: propSort === key ? "var(--brand-600)" : "#fff",
                    color: propSort === key ? "#fff" : "var(--ink-600)",
                    borderColor: propSort === key ? "var(--brand-600)" : "var(--ink-200)",
                    fontWeight: propSort === key ? 700 : 500,
                  }}
                  onClick={() => { haptics.selection(); setPropSort(key); }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {sortedProposals.length === 0 ? (
            <EmptyState
              emoji="⏳"
              title={t("no_proposals_yet")}
              text={isMine ? t("no_proposals_mine") : isGuest ? t("no_proposals_guest") : t("no_proposals_other")}
            />
          ) : (
            <div className="col gap-12">
              {sortedProposals.map((p) => (
                <div key={p.id}
                  className="card queue-row-enter" style={{ border: accepted === p.id ? "2px solid var(--green-500)" : p.isBoosted ? "1.5px solid var(--amber-500)" : "1px solid var(--line)" }}>
                  <div className="row gap-10">
                    <SafeImg
                      src={p.responderAvatar}
                      variant="avatar"
                      className="avatar"
                      style={{ width: 42, height: 42, cursor: "pointer" }}
                      onClick={() => openProfile(p.responderUserId!, p.responderType === "business" ? "BUSINESS" : "PROVIDER", { name: p.responderName, avatar: p.responderAvatar })}
                    />
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="row gap-6">
                        <span className="semi small ellipsis">{p.responderName}</span>
                        {p.responderType === "business" && <BadgeCheck size={14} color="var(--brand-600)" />}
                      </div>
                      <span className="tiny muted">{p.responderTagline}</span>
                    </div>
                    <div className="col" style={{ alignItems: "flex-end", gap: 2 }}>
                      <Rating value={p.responderRating} size={10} />
                      {p.isBoosted && <span className="badge badge-amber" style={{ fontSize: 9 }}><Zap size={9} /> {t("boosted_badge")}</span>}
                      {/* Server-truth status — the "Accepted"/local-optimistic pill further
                          down only appears mid-tap for isMine+OPEN; this is what still shows
                          the real outcome on every later visit to a decided request. */}
                      {p.status !== "SUBMITTED" && (
                        <span className={`badge ${PROPOSAL_STATUS_BADGE[p.status].cls}`} style={{ fontSize: 9 }}>{PROPOSAL_STATUS_BADGE[p.status].label}</span>
                      )}
                    </div>
                  </div>

                  <p className="small" style={{ marginTop: 10, lineHeight: 1.5 }}>{p.message}</p>

                  <div className="row between" style={{ marginTop: 12 }}>
                    <div className="row gap-12">
                      <div className="col" style={{ gap: 0 }}>
                        <span className="tiny muted">{t("quote_label")}</span>
                        <span className="bold" style={{ color: "var(--green-500)" }}>{inr(p.price)}</span>
                      </div>
                      <div className="col" style={{ gap: 0 }}>
                        <span className="tiny muted">{t("eta_label")}</span>
                        <span className="semi small">{p.eta}</span>
                      </div>
                    </div>
                    {isMine && r.status === "OPEN" && (
                      accepted === p.id ? (
                        <span className="badge badge-green"><CheckCircle2 size={13} /> {t("accepted_badge")}</span>
                      ) : (
                        <div className="row gap-8">
                          <button className="btn btn-outline btn-sm icon-btn" style={{ width: 36, padding: 0 }} title={t("message")} onClick={() => messageResponder(p)} disabled={!!accepted || messaging === p.id}>
                            <MessageCircle size={15} />
                          </button>
                          <button className="btn btn-outline btn-sm" onClick={() => setCounterFor(counterFor === p.id ? null : p.id)} disabled={!!accepted}>
                            <ArrowRightLeft size={14} /> {t("counter_action")}
                          </button>
                          <button className="btn btn-green btn-sm" onClick={() => acceptProposal(p)} disabled={!!accepted}>
                            {t("accept_action")}
                          </button>
                        </div>
                      )
                    )}
                  </div>

                  {/* Counter-offer history (visible to both parties) */}
                  {(p.counters ?? []).length > 0 && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed var(--ink-200)" }}>
                      <div className="row gap-6 tiny semi muted" style={{ marginBottom: 8 }}>
                        <ArrowRightLeft size={12} /> {t("negotiation_label")}
                      </div>
                      {(p.counters ?? []).map((c) => (
                        <div
                          key={c.id}
                          className="col"
                          style={{
                            alignItems: c.by === "requester" ? "flex-start" : "flex-end",
                            marginBottom: 6,
                          }}
                        >
                          <div style={{
                            background: c.by === "requester" ? "var(--brand-100)" : "var(--green-100)",
                            borderRadius: "var(--radius-sm)",
                            padding: "6px 10px",
                            maxWidth: "75%",
                          }}>
                            <div className="tiny semi" style={{ color: c.by === "requester" ? "var(--brand-700)" : "var(--green-600)" }}>
                              {c.by === "requester" ? t("requester_label") : t("provider_label")} {t("counter_word")}: {inr(c.amount)}
                            </div>
                            {c.message && <div className="tiny muted" style={{ marginTop: 2 }}>{c.message}</div>}
                          </div>
                          <span className="tiny muted" style={{ marginTop: 2 }}>{c.time}</span>
                        </div>
                      ))}
                      {isMine && r.status === "OPEN" && !accepted && (p.counters ?? []).length > 0
                        && (p.counters ?? [])[(p.counters ?? []).length - 1].by === "responder" && (
                        <button
                          className="btn btn-green btn-sm btn-block"
                          style={{ marginTop: 8 }}
                          onClick={() => acceptCounter(p, (p.counters ?? [])[(p.counters ?? []).length - 1])}
                        >
                          {tf("accept_at_amount", { amount: inr((p.counters ?? [])[(p.counters ?? []).length - 1].amount) })}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Requester: send counter input */}
                  {counterFor === p.id && (
                    <div className="card card-condensed" style={{ marginTop: 10, background: "var(--ink-50)", border: "none" }}>
                      <div className="tiny semi muted" style={{ marginBottom: 8 }}>{t("propose_different_price")}</div>
                      <div className="row gap-8">
                        <div className="row grow" style={{ border: "1.5px solid var(--ink-200)", borderRadius: "var(--radius-sm)", padding: "0 10px", background: "#fff" }}>
                          <span className="muted" style={{ padding: "10px 0" }}>₹</span>
                          <input className="input" style={{ border: "none", padding: "10px 6px" }} inputMode="numeric" placeholder={`e.g. ${p.price - 50}`} value={counterAmt} onChange={(e) => setCounterAmt(e.target.value.replace(/\D/g, ""))} />
                        </div>
                        <button className="btn btn-primary btn-sm" disabled={!counterAmt || counterBusy === p.id} onClick={() => void sendCounter(p)}>{counterBusy === p.id ? t("sending_ellipsis") : t("send_word")}</button>
                      </div>
                      <div className="tiny muted" style={{ marginTop: 6 }}>{t("can_accept_or_counter")}</div>
                    </div>
                  )}

                  {/* Responder: counter-back input on their own proposal */}
                  {!isMine && p.responderUserId === user.id && (p.counters ?? []).length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      {counterBackFor === p.id ? (
                        <div className="card card-condensed" style={{ background: "var(--ink-50)", border: "none" }}>
                          <div className="tiny semi muted" style={{ marginBottom: 8 }}>{t("your_counter_offer")}</div>
                          <div className="row gap-8">
                            <div className="row grow" style={{ border: "1.5px solid var(--ink-200)", borderRadius: "var(--radius-sm)", padding: "0 10px", background: "#fff" }}>
                              <span className="muted" style={{ padding: "10px 0" }}>₹</span>
                              <input className="input" style={{ border: "none", padding: "10px 6px" }} inputMode="numeric" placeholder={`e.g. ${p.price}`} value={counterBackAmt} onChange={(e) => setCounterBackAmt(e.target.value.replace(/\D/g, ""))} />
                            </div>
                            <button className="btn btn-primary btn-sm" disabled={!counterBackAmt || counterBusy === p.id} onClick={() => void sendCounterBack(p)}>{counterBusy === p.id ? t("sending_ellipsis") : t("send_word")}</button>
                          </div>
                          <button className="tiny muted" style={{ marginTop: 6 }} onClick={() => { setCounterBackFor(null); setCounterBackAmt(""); }}>{t("cancel_action")}</button>
                        </div>
                      ) : (
                        <button
                          className="btn btn-outline btn-sm"
                          style={{ marginTop: 0 }}
                          onClick={() => setCounterBackFor(p.id)}
                        >
                          <ArrowRightLeft size={13} /> {t("counter_back")}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {!isMine && !isGuest && (
          <div className="page-pad">
            <button className="row gap-6 tiny muted center" style={{ width: "100%", padding: 10 }} onClick={() => setReport(true)}>
              <Flag size={13} /> {t("report_request")}
            </button>
          </div>
        )}
      </div>

      {/* Respond CTA for non-owners. A guest sees the request and every offer on
          it, but can't respond — quoting is a commitment to a real neighbour, so
          the button becomes a sign-in prompt. */}
      {!isMine && r.status === "OPEN" && (
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid var(--line)", padding: "var(--space-sm)", zIndex: 30 }}>
          {isGuest ? (
            <GuestSignInPrompt message="Sign in to send a proposal" compact />
          ) : (
            <button className="btn btn-primary btn-block" onClick={() => nav(`/request/${r.id}/propose`)}>
              <Send size={17} /> {t("send_proposal")}
            </button>
          )}
        </div>
      )}

      {report && <ReportSheet targetType="REQUEST" targetId={r.id} name="this request" onClose={() => setReport(false)} />}
      {share && <ShareCard title={r.title} subtitle={`${r.categoryName} • ${budget}`} image={r.photos[0] ?? PLACEHOLDER_REQUEST_SHARE} meta={`📍 ${r.area} • needed by ${r.deadline}`} onClose={() => setShare(false)} />}

      {/* Edit Request Sheet */}
      {editing && (
        <div className="sheet-backdrop" onClick={() => setEditing(false)}>
          <div className="sheet col gap-14" style={{ maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div className="row between">
              <span className="bold" style={{ fontSize: 18 }}>{t("edit_request")}</span>
              <button className="icon-btn" onClick={() => setEditing(false)}><X size={18} /></button>
            </div>

            <div className="col gap-10">
              <label className="small semi muted">{t("title_headline_label")}</label>
              <input className="input" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder={t("title_headline_placeholder")} />

              <label className="small semi muted">{t("detailed_description_label")}</label>
              <textarea className="input" style={{ minHeight: 90, resize: "vertical" }} value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder={t("detailed_description_placeholder")} />

              <div className="row gap-10">
                <div className="col grow">
                  <label className="small semi muted">{t("min_budget_label")}</label>
                  <input className="input" type="number" value={editMinBudget} onChange={(e) => setEditMinBudget(e.target.value)} placeholder={t("budget_placeholder_500")} />
                </div>
                <div className="col grow">
                  <label className="small semi muted">{t("max_budget_label")}</label>
                  <input className="input" type="number" value={editMaxBudget} onChange={(e) => setEditMaxBudget(e.target.value)} placeholder={t("budget_placeholder_1500")} />
                </div>
              </div>

              <div className="row between card" style={{ padding: "10px 14px", marginTop: 4 }}>
                <span className="small semi row gap-6"><Flame size={14} color="var(--red-500)" /> {t("mark_as_urgent")}</span>
                <input type="checkbox" checked={editUrgent} onChange={(e) => setEditUrgent(e.target.checked)} style={{ width: 18, height: 18, cursor: "pointer" }} />
              </div>
            </div>

            <div className="row gap-10" style={{ marginTop: 10 }}>
              <button className="btn btn-outline grow" onClick={() => setEditing(false)}>{t("cancel_action")}</button>
              <button className="btn btn-primary grow" disabled={updating || !editTitle.trim()} onClick={handleSaveEdit}>
                {updating ? t("saving_ellipsis") : t("save_changes")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Sheet */}
      {showDeleteConfirm && (
        <div className="sheet-backdrop" onClick={() => setShowDeleteConfirm(false)}>
          <div className="sheet col gap-14 center" style={{ textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--red-100)", color: "var(--red-500)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Trash2 size={28} />
            </div>
            <div>
              <h3 className="bold h2">{t("delete_request_question")}</h3>
              <p className="small muted" style={{ marginTop: 6, lineHeight: 1.4 }}>{t("delete_request_confirm_desc")}</p>
            </div>
            <div className="row gap-10" style={{ width: "100%", marginTop: 8 }}>
              <button className="btn btn-outline grow" onClick={() => setShowDeleteConfirm(false)}>{t("keep_it")}</button>
              <button className="btn btn-block grow" style={{ background: "var(--red-500)", color: "#fff" }} disabled={deleting} onClick={handleDeleteRequest}>
                {deleting ? t("deleting_ellipsis") : t("yes_delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Cell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="grow col" style={{ gap: 2, alignItems: "center", textAlign: "center" }}>
      <span className="tiny muted">{label}</span>
      <span className="semi small" style={{ color }}>{value}</span>
    </div>
  );
}

// Live "expires in Xh Ym" pill for an OPEN request. Ticks each minute; turns
// red under an hour; renders nothing once past (the server sweep flips status).
function ExpiryCountdown({ expiresAt }: { expiresAt: string }) {
  const { t, tf } = useI18n();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    // Named to avoid shadowing the t() translation function above — this
    // scope is isolated to the effect either way, but the rename makes that
    // obvious rather than relying on it.
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const msLeft = new Date(expiresAt).getTime() - now;
  if (msLeft <= 0) return null;
  const totalMin = Math.floor(msLeft / 60_000);
  const urgent = msLeft < 3_600_000;
  const formatLabel = (min: number) => {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h > 0 ? tf("hours_mins_left", { h, m }) : tf("mins_left", { m });
  };
  return (
    <span
      className="row gap-4"
      style={{
        alignItems: "center",
        alignSelf: "flex-start",
        marginTop: "var(--space-xs)",
        padding: "3px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        background: urgent ? "var(--red-50)" : "var(--brand-50)",
        color: urgent ? "var(--red-500)" : "var(--brand-700)",
        border: `1px solid ${urgent ? "var(--red-100)" : "var(--brand-200)"}`,
      }}
    >
      <Clock size={12} /> {t("expires_in_prefix")} <AnimatedNumber value={totalMin} format={formatLabel} durationMs={280} />
    </span>
  );
}
function Sep() {
  return <div style={{ width: 1, alignSelf: "stretch", background: "var(--line)" }} />;
}
