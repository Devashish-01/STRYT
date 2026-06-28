import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Share2, MapPin, Clock, Eye, Zap, BadgeCheck,
  Flag, CheckCircle2, Send, Users, Flame, Repeat, MessageSquare, ArrowRightLeft,
  Edit3, Trash2, XCircle, X
} from "lucide-react";
import { requestService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { Skeleton, ErrorView } from "@/components/states";
import { Rating, EmptyState, SafeImg, inr } from "@/components/common";
import { useApp } from "@/store";
import ReportSheet from "@/components/ReportSheet";
import ShareCard from "@/components/ShareCard";
import type { Proposal } from "@/types";

export default function RequestDetail() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { user, showToast, meToos, toggleMeToo, isAuthed } = useApp();
  const { data: r, loading, error, refetch } = useQuery(() => requestService.get(id, user.lat || 0, user.lng || 0), [id]);
  const [report, setReport] = useState(false);
  const [share, setShare] = useState(false);
  const [accepted, setAccepted] = useState<string | null>(null);
  const [counterFor, setCounterFor] = useState<string | null>(null);
  const [counterAmt, setCounterAmt] = useState("");
  const [counterBackFor, setCounterBackFor] = useState<string | null>(null);
  const [counterBackAmt, setCounterBackAmt] = useState("");

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
        <EmptyState emoji="📋" title="Request not found" text="This request may have expired or been removed." />
      </div>
    );
  }

  const isMine = r.requesterUserId === user.id;
  const budget = r.budgetMin && r.budgetMax ? `${inr(r.budgetMin)} – ${inr(r.budgetMax)}` : "Open budget";
  const sortedProposals = [...r.proposals].sort((a, b) => Number(b.isBoosted) - Number(a.isBoosted));
  const meTooed = meToos.includes(r.id) || r.meTooed;
  const meTooCount = (r.meTooCount ?? 0) + (meTooed && !r.meTooed ? 1 : 0);

  async function acceptProposal(p: Proposal) {
    setAccepted(p.id);
    try {
      const result = await requestService.acceptProposal(p.id);
      showToast(`Accepted ${p.responderName}'s offer`);
      setTimeout(() => nav(result.agreementId ? `/agreement/${result.agreementId}` : `/agreements`), 700);
    } catch {
      setAccepted(null);
      showToast("Couldn't accept proposal. Try again.");
    }
  }

  async function sendCounter(p: Proposal) {
    if (!counterAmt) return;
    try {
      await requestService.submitCounter(p.id, Number(counterAmt));
      showToast(`Counter offer of ${inr(Number(counterAmt))} sent`);
      setCounterFor(null);
      setCounterAmt("");
      refetch();
    } catch {
      showToast("Couldn't send counter. Try again.");
    }
  }

  async function sendCounterBack(p: Proposal) {
    if (!counterBackAmt) return;
    try {
      await requestService.submitCounter(p.id, Number(counterBackAmt));
      showToast(`Your counter of ${inr(Number(counterBackAmt))} sent`);
      setCounterBackFor(null);
      setCounterBackAmt("");
      refetch();
    } catch {
      showToast("Couldn't send counter. Try again.");
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
        <span className="grow bold" style={{ fontSize: 16 }}>Request</span>
        <button className="icon-btn" onClick={() => setShare(true)}><Share2 size={18} /></button>
      </header>

      <div className="screen-scroll" style={{ paddingBottom: isMine ? 24 : 92 }}>
        <div className="page-pad">
          {/* Requester */}
          <div className="row gap-10">
            <SafeImg src={r.requesterAvatar} variant="avatar" className="avatar" style={{ width: 44, height: 44 }} />
            <div className="grow">
              <div className="row gap-6"><span className="semi">{r.requesterName}</span><Rating value={r.requesterRating} size={10} /></div>
              <span className="tiny muted row gap-4"><MapPin size={12} /> {r.area} • {r.distanceKm} km • {r.postedAt}</span>
            </div>
            {r.status !== "OPEN" && <span className="badge badge-blue">{r.status}</span>}
          </div>

          {/* Owner Management Controls (CRUD) */}
          {isMine && (
            <div className="row gap-8" style={{ marginTop: 12, background: "var(--ink-50)", padding: 8, borderRadius: 12 }}>
              <button className="btn btn-outline btn-sm grow row center gap-6" onClick={startEdit}>
                <Edit3 size={14} /> Edit Request
              </button>
              <button className="btn btn-outline btn-sm row center gap-6" style={{ color: "#ef4444", borderColor: "#fca5a5" }} onClick={() => setShowDeleteConfirm(true)}>
                <Trash2 size={14} /> Delete
              </button>
            </div>
          )}

          {/* Title + meta */}
          <div className="row wrap gap-6" style={{ marginTop: 16 }}>
            {r.isUrgent && <span className="badge badge-red"><Flame size={11} /> Urgent</span>}
            {r.isBoosted && <span className="badge badge-amber"><Zap size={11} /> Boosted</span>}
            {r.isGroupBuy && <span className="badge badge-green"><Users size={11} /> Group buy</span>}
            {r.isRecurring && <span className="badge badge-blue"><Repeat size={11} /> Recurring</span>}
            <span className="badge badge-purple">{r.categoryName}</span>
            {r.expiresInHrs && <span className="badge badge-gray"><Clock size={11} /> expires in {r.expiresInHrs}h</span>}
          </div>
          <h1 className="bold" style={{ fontSize: 22, marginTop: 8 }}>{r.title}</h1>
          <p className="small" style={{ marginTop: 8, lineHeight: 1.6, color: "var(--ink-700)" }}>{r.description}</p>

          {r.photos.length > 0 && (
            <div className="row gap-8" style={{ marginTop: 12, overflowX: "auto" }}>
              {r.photos.map((ph, i) => (
                <SafeImg key={i} src={ph} className="thumb" style={{ width: 120, height: 120, borderRadius: 14, flexShrink: 0 }} />
              ))}
            </div>
          )}

          {/* Group buy progress */}
          {r.isGroupBuy && r.groupBuyTarget && (
            <div className="card" style={{ padding: 14, marginTop: 14, background: "#e8f7ee", border: "1px solid #bbf7d0" }}>
              <div className="row between tiny" style={{ marginBottom: 6 }}>
                <span className="semi" style={{ color: "#15803d" }}>{meTooCount} of {r.groupBuyTarget} neighbors in</span>
                <span className="muted">{r.groupBuyTarget - meTooCount} more unlocks bulk price</span>
              </div>
              <div style={{ height: 8, borderRadius: 6, background: "#fff", overflow: "hidden" }}>
                <div style={{ width: `${Math.min(100, (meTooCount / r.groupBuyTarget) * 100)}%`, height: "100%", background: "linear-gradient(90deg,#16a34a,#4ade80)" }} />
              </div>
            </div>
          )}

          {/* Me too */}
          <button
            className="btn btn-block btn-sm"
            style={{ marginTop: 14, background: meTooed ? "var(--brand-800)" : "var(--ink-50)", color: meTooed ? "#fff" : "var(--ink-700)" }}
            onClick={async () => {
              if (r.requesterUserId === user.id) {
                showToast("You can't me-too your own request");
                return;
              }
              toggleMeToo(r.id); // optimistic UI
              try {
                await requestService.meToo(r.id);
              } catch {
                toggleMeToo(r.id); // revert on failure
              }
            }}
          >
            <Users size={16} /> {meTooed ? "You're in — me too ✓" : "Me too — I need this as well"} {meTooCount > 0 && `· ${meTooCount}`}
          </button>

          {/* Detail card */}
          <div className="card row" style={{ padding: 14, marginTop: 14 }}>
            <Cell label="Budget" value={budget} color="#16a34a" />
            <Sep />
            <Cell label="Needed by" value={r.deadline} />
            <Sep />
            <Cell label="Radius" value={`${r.radiusKm} km`} />
          </div>
          <div className="row gap-12 tiny muted" style={{ marginTop: 10 }}>
            <span className="row gap-4"><Eye size={12} /> {r.viewCount} views</span>
            <span className="row gap-4"><Clock size={12} /> {r.proposals.length} proposals</span>
          </div>
        </div>

        <div className="divider" />

        {/* Proposals */}
        <div className="page-pad" style={{ paddingTop: 0 }}>
          <h3 className="bold" style={{ fontSize: 17, marginBottom: 12 }}>
            {isMine ? "Proposals received" : "Proposals"} ({r.proposals.length})
          </h3>

          {sortedProposals.length === 0 ? (
            <EmptyState
              emoji="⏳"
              title="No proposals yet"
              text={isMine ? "Hang tight — nearby providers will respond soon." : "Be the first to send a proposal."}
            />
          ) : (
            <div className="col gap-12">
              {sortedProposals.map((p) => (
                <div
                  key={p.id}
                  className="card"
                  style={{ padding: 14, border: accepted === p.id ? "2px solid var(--green-500)" : p.isBoosted ? "1.5px solid #fcd34d" : "1px solid var(--line)" }}
                >
                  <div className="row gap-10">
                    <SafeImg src={p.responderAvatar} variant="avatar" className="avatar" style={{ width: 42, height: 42 }} />
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="row gap-6">
                        <span className="semi small ellipsis">{p.responderName}</span>
                        {p.responderType === "business" && <BadgeCheck size={14} color="#e5521c" />}
                      </div>
                      <span className="tiny muted">{p.responderTagline}</span>
                    </div>
                    <div className="col" style={{ alignItems: "flex-end", gap: 2 }}>
                      <Rating value={p.responderRating} size={10} />
                      {p.isBoosted && <span className="badge badge-amber" style={{ fontSize: 9 }}><Zap size={9} /> Boosted</span>}
                    </div>
                  </div>

                  <p className="small" style={{ marginTop: 10, lineHeight: 1.5 }}>{p.message}</p>

                  <div className="row between" style={{ marginTop: 12 }}>
                    <div className="row gap-12">
                      <div className="col" style={{ gap: 0 }}>
                        <span className="tiny muted">Quote</span>
                        <span className="bold" style={{ color: "#16a34a" }}>{inr(p.price)}</span>
                      </div>
                      <div className="col" style={{ gap: 0 }}>
                        <span className="tiny muted">ETA</span>
                        <span className="semi small">{p.eta}</span>
                      </div>
                    </div>
                    {isMine && r.status === "OPEN" && (
                      accepted === p.id ? (
                        <span className="badge badge-green"><CheckCircle2 size={13} /> Accepted</span>
                      ) : (
                        <div className="row gap-8">
                          <button className="btn btn-outline btn-sm" onClick={() => setCounterFor(counterFor === p.id ? null : p.id)} disabled={!!accepted}>
                            <MessageSquare size={14} /> Counter
                          </button>
                          <button className="btn btn-green btn-sm" onClick={() => acceptProposal(p)} disabled={!!accepted}>
                            Accept
                          </button>
                        </div>
                      )
                    )}
                  </div>

                  {/* Counter-offer history (visible to both parties) */}
                  {(p.counters ?? []).length > 0 && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed var(--ink-200)" }}>
                      <div className="row gap-6 tiny semi muted" style={{ marginBottom: 8 }}>
                        <ArrowRightLeft size={12} /> Negotiation
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
                            background: c.by === "requester" ? "#ede9fe" : "#dcfce7",
                            borderRadius: 10,
                            padding: "6px 10px",
                            maxWidth: "75%",
                          }}>
                            <div className="tiny semi" style={{ color: c.by === "requester" ? "var(--brand-700)" : "#15803d" }}>
                              {c.by === "requester" ? "Requester" : "Provider"} counter: {inr(c.amount)}
                            </div>
                            {c.message && <div className="tiny muted" style={{ marginTop: 2 }}>{c.message}</div>}
                          </div>
                          <span className="tiny muted" style={{ marginTop: 2 }}>{c.time}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Requester: send counter input */}
                  {counterFor === p.id && (
                    <div className="card" style={{ padding: 12, marginTop: 10, background: "var(--ink-50)", border: "none" }}>
                      <div className="tiny semi muted" style={{ marginBottom: 8 }}>Propose a different price</div>
                      <div className="row gap-8">
                        <div className="row grow" style={{ border: "1.5px solid var(--ink-200)", borderRadius: 10, padding: "0 10px", background: "#fff" }}>
                          <span className="muted" style={{ padding: "10px 0" }}>₹</span>
                          <input className="input" style={{ border: "none", padding: "10px 6px" }} inputMode="numeric" placeholder={`e.g. ${p.price - 50}`} value={counterAmt} onChange={(e) => setCounterAmt(e.target.value.replace(/\D/g, ""))} />
                        </div>
                        <button className="btn btn-primary btn-sm" disabled={!counterAmt} onClick={() => void sendCounter(p)}>Send</button>
                      </div>
                      <div className="tiny muted" style={{ marginTop: 6 }}>They can accept or counter back.</div>
                    </div>
                  )}

                  {/* Responder: counter-back input on their own proposal */}
                  {!isMine && p.responderUserId === user.id && (p.counters ?? []).length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      {counterBackFor === p.id ? (
                        <div className="card" style={{ padding: 12, background: "var(--ink-50)", border: "none" }}>
                          <div className="tiny semi muted" style={{ marginBottom: 8 }}>Your counter offer</div>
                          <div className="row gap-8">
                            <div className="row grow" style={{ border: "1.5px solid var(--ink-200)", borderRadius: 10, padding: "0 10px", background: "#fff" }}>
                              <span className="muted" style={{ padding: "10px 0" }}>₹</span>
                              <input className="input" style={{ border: "none", padding: "10px 6px" }} inputMode="numeric" placeholder={`e.g. ${p.price}`} value={counterBackAmt} onChange={(e) => setCounterBackAmt(e.target.value.replace(/\D/g, ""))} />
                            </div>
                            <button className="btn btn-primary btn-sm" disabled={!counterBackAmt} onClick={() => void sendCounterBack(p)}>Send</button>
                          </div>
                          <button className="tiny muted" style={{ marginTop: 6 }} onClick={() => { setCounterBackFor(null); setCounterBackAmt(""); }}>Cancel</button>
                        </div>
                      ) : (
                        <button
                          className="btn btn-outline btn-sm"
                          style={{ marginTop: 0 }}
                          onClick={() => setCounterBackFor(p.id)}
                        >
                          <ArrowRightLeft size={13} /> Counter back
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {!isMine && (
          <div className="page-pad">
            <button className="row gap-6 tiny muted center" style={{ width: "100%", padding: 10 }} onClick={() => setReport(true)}>
              <Flag size={13} /> Report this request
            </button>
          </div>
        )}
      </div>

      {/* Respond CTA for non-owners */}
      {!isMine && r.status === "OPEN" && (
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid var(--line)", padding: 12, zIndex: 30 }}>
          <button className="btn btn-primary btn-block" onClick={() => nav(`/request/${r.id}/propose`)}>
            <Send size={17} /> Send a proposal
          </button>
        </div>
      )}

      {report && <ReportSheet targetType="REQUEST" targetId={r.id} name="this request" onClose={() => setReport(false)} />}
      {share && <ShareCard title={r.title} subtitle={`${r.categoryName} • ${budget}`} image={r.photos[0] ?? "https://images.unsplash.com/photo-1556911220-bff31c812dba?auto=format&fit=crop&w=600&q=70"} meta={`📍 ${r.area} • needed by ${r.deadline}`} onClose={() => setShare(false)} />}

      {/* Edit Request Sheet */}
      {editing && (
        <div className="sheet-backdrop" onClick={() => setEditing(false)}>
          <div className="sheet col gap-14" style={{ maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div className="row between">
              <span className="bold" style={{ fontSize: 18 }}>Edit Request</span>
              <button className="icon-btn" onClick={() => setEditing(false)}><X size={18} /></button>
            </div>

            <div className="col gap-10">
              <label className="small semi muted">Title / Headline</label>
              <input className="input" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="e.g. Need plumber for pipe leakage" />

              <label className="small semi muted">Detailed Description</label>
              <textarea className="input" style={{ minHeight: 90, resize: "vertical" }} value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="Explain what you need in detail..." />

              <div className="row gap-10">
                <div className="col grow">
                  <label className="small semi muted">Min Budget (₹)</label>
                  <input className="input" type="number" value={editMinBudget} onChange={(e) => setEditMinBudget(e.target.value)} placeholder="e.g. 500" />
                </div>
                <div className="col grow">
                  <label className="small semi muted">Max Budget (₹)</label>
                  <input className="input" type="number" value={editMaxBudget} onChange={(e) => setEditMaxBudget(e.target.value)} placeholder="e.g. 1500" />
                </div>
              </div>

              <div className="row between card" style={{ padding: "10px 14px", marginTop: 4 }}>
                <span className="small semi row gap-6"><Flame size={14} color="#ef4444" /> Mark as Urgent</span>
                <input type="checkbox" checked={editUrgent} onChange={(e) => setEditUrgent(e.target.checked)} style={{ width: 18, height: 18, cursor: "pointer" }} />
              </div>
            </div>

            <div className="row gap-10" style={{ marginTop: 10 }}>
              <button className="btn btn-outline grow" onClick={() => setEditing(false)}>Cancel</button>
              <button className="btn btn-primary grow" disabled={updating || !editTitle.trim()} onClick={handleSaveEdit}>
                {updating ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Sheet */}
      {showDeleteConfirm && (
        <div className="sheet-backdrop" onClick={() => setShowDeleteConfirm(false)}>
          <div className="sheet col gap-14 center" style={{ textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#fee2e2", color: "#ef4444", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Trash2 size={28} />
            </div>
            <div>
              <h3 className="bold" style={{ fontSize: 18 }}>Delete this request?</h3>
              <p className="small muted" style={{ marginTop: 6, lineHeight: 1.4 }}>Are you sure you want to cancel and delete this request? This action cannot be undone.</p>
            </div>
            <div className="row gap-10" style={{ width: "100%", marginTop: 8 }}>
              <button className="btn btn-outline grow" onClick={() => setShowDeleteConfirm(false)}>Keep it</button>
              <button className="btn btn-block grow" style={{ background: "#ef4444", color: "#fff" }} disabled={deleting} onClick={handleDeleteRequest}>
                {deleting ? "Deleting..." : "Yes, Delete"}
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
function Sep() {
  return <div style={{ width: 1, alignSelf: "stretch", background: "var(--line)" }} />;
}
