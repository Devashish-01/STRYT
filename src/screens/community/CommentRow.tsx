import { useState, type CSSProperties } from "react";
import { Phone, Flag, Pencil, Trash2, DotsThree, PushPin } from "@/components/Icons";
import { SafeImg } from "@/components/common";
import type { Comment } from "@/types";
import { hoistPinned } from "@/lib/communityPost";
import { openProfile } from "@/lib/profileSheet";
import { COMMENT_REACTIONS, parseBody } from "@/lib/mentions";
import { useI18n } from "@/lib/i18n";
import UnderReviewNotice from "@/features/moderation/UnderReviewNotice";

export function CommentBody({ body, mentions }: { body: string; mentions?: { userId: string; alias: string }[] }) {
  const segments = parseBody(body, mentions ?? []);
  return (
    <p className="small" style={{ marginTop: 4, lineHeight: 1.5, color: "var(--ink-800)", fontSize: 13.5, whiteSpace: "pre-wrap" }}>
      {segments.map((seg, i) =>
        seg.kind === "mention" && seg.userId ? (
          <button
            key={i}
            className="semi"
            style={{ color: "var(--brand-700)", background: "none", border: "none", padding: 0, font: "inherit", fontWeight: 600, cursor: "pointer" }}
            onClick={(e) => {
              e.stopPropagation();
              openProfile(seg.userId!, "USER", { name: seg.alias });
            }}
          >
            {seg.text}
          </button>
        ) : (
          <span key={i}>{seg.text}</span>
        )
      )}
    </p>
  );
}


const MENU_ITEM: CSSProperties = {
  padding: "8px 10px", borderRadius: 8, background: "none", border: "none",
  cursor: "pointer", textAlign: "left", width: "100%", fontSize: 13,
};

export function CommentRow({
  c, nav, onReply, compact, canReply = true, onReact, canReact = true,
  isMine = false, isPostAuthor = false, canReport = false,
  onDelete, onEdit, onTogglePin, onReport,
}: {
  c: Comment;
  nav: (to: string) => void;
  onReply: () => void;
  compact?: boolean;
  canReply?: boolean;
  onReact?: (emoji: string | null) => void;
  canReact?: boolean;
  /** The signed-in viewer wrote this comment. */
  isMine?: boolean;
  /** The signed-in viewer wrote the POST this comment sits under. */
  isPostAuthor?: boolean;
  canReport?: boolean;
  onDelete?: () => void;
  /** Resolves once the edit is saved; the row stays in edit mode if the server
   *  refused it. */
  onEdit?: (body: string) => Promise<void>;
  onTogglePin?: () => void;
  onReport?: () => void;
}) {
  const size = compact ? 32 : 38;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { t } = useI18n();
  const [editingBody, setEditingBody] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const tallies = Object.entries(c.reactions ?? {}).filter(([, n]) => n > 0);
  const pinned = !!c.pinnedAt;
  // Delete: your own words, or anything under your own post — the two
  // permissions community_comment_delete grants. Pin: the post's author only,
  // and never on a reply, since the pin sorts to the top of the top-level list
  // where a reply has no place.
  const canDelete = !!onDelete && (isMine || isPostAuthor);
  const canEdit = !!onEdit && isMine;
  const canPin = !!onTogglePin && isPostAuthor && !compact;
  const hasMenu = canDelete || canEdit || canPin || (canReport && !isMine);

  async function saveEdit() {
    const next = (editingBody ?? "").trim();
    if (!next || next === c.body) { setEditingBody(null); return; }
    setSavingEdit(true);
    try {
      await onEdit?.(next);
      setEditingBody(null);
    } catch {
      // The parent has already surfaced the reason; stay in edit mode so the
      // typed text isn't thrown away.
    } finally {
      setSavingEdit(false);
    }
  }
  return (
    <div className="row gap-10" style={{ alignItems: "flex-start" }}>
      <SafeImg src={c.authorAvatar} variant="avatar" className="avatar" style={{ width: size, height: size, flexShrink: 0, borderRadius: "50%", border: "1px solid var(--ink-200)" }} />
      <div className="grow" style={{ minWidth: 0 }}>
        <div style={{
          background: pinned ? "var(--brand-50)" : "var(--ink-50)",
          padding: "10px 14px", borderRadius: 16,
          border: pinned ? "1px solid var(--brand-200)" : "1px solid rgba(226, 225, 240, 0.7)",
        }}>
          {pinned && (
            <span className="tiny semi row gap-4 center-v" style={{ color: "var(--brand-700)", marginBottom: 5, fontSize: 11 }}>
              <PushPin size={11} weight="fill" /> Pinned by the author
            </span>
          )}
          <div className="row between gap-6 center-v">
            <span className="semi small" style={{ color: "var(--ink-900)", fontSize: 13.5, fontWeight: 600 }}>{c.authorName}</span>
            <span className="tiny muted" style={{ fontSize: 11.5 }}>
              {c.time}{c.editedAt ? " · edited" : ""}
            </span>
          </div>
          {editingBody !== null ? (
            <div className="col gap-6" style={{ marginTop: 6 }}>
              <textarea
                className="input"
                style={{ minHeight: 60, fontSize: 13.5 }}
                value={editingBody}
                autoFocus
                aria-label={t("cpd_edit_comment_aria")}
                onChange={(e) => setEditingBody(e.target.value)}
              />
              <div className="row gap-8">
                <button className="btn btn-outline btn-sm grow" disabled={savingEdit} onClick={() => setEditingBody(null)}>{t("cancel")}</button>
                <button className="btn btn-sm grow" disabled={savingEdit || !editingBody.trim()} onClick={saveEdit}>
                  {savingEdit ? "Saving…" : "Save"}
                </button>
              </div>
              {/* Mentions stay as originally posted — an edit can't @-ping new
                  people after the fact. Same rule community_comment_update
                  enforces server-side. */}
              <span className="tiny muted" style={{ fontSize: 11 }}>{t("cpd_mentions_note")}</span>
            </div>
          ) : (
            <>
              <CommentBody body={c.body} mentions={c.mentions} />
              {c.hiddenAt && <UnderReviewNotice kind="comment" />}
            </>
          )}
          {c.sharedPhone && (
            <a
              href={`tel:${c.sharedPhone}`}
              className="tiny semi row gap-4 center-v"
              style={{ color: "var(--brand-700)", marginTop: 6, background: "var(--brand-50)", border: "1px solid var(--brand-100)", borderRadius: 10, padding: "4px 9px", width: "fit-content" }}
            >
              <Phone size={12} /> {c.sharedPhone}
              {c.phoneVisibility === "OWNER" && <span className="muted" style={{ fontWeight: 500 }}>{t("cpd_shared_with_you")}</span>}
            </a>
          )}
          {c.listingId && (
            <button
              className="tiny semi"
              style={{ color: "var(--brand-700)", marginTop: 6, display: "block", background: "none", border: "none", cursor: "pointer" }}
              onClick={() => nav(c.listingType === "BUSINESS" ? `/business/${c.listingId}` : `/provider/${c.listingId}`)}
            >
              → View listing
            </button>
          )}
        </div>
        {/* Reaction tallies + the row's own actions. A reaction is the cheap
            acknowledgement that stops "thanks, this helped" from becoming a
            full reply and burying the useful answer. */}
        <div className="row gap-6 center-v wrap" style={{ marginTop: 5, marginLeft: 6 }}>
          {tallies.map(([emoji, n]) => {
            const isMine = c.myReaction === emoji;
            return (
              <button
                key={emoji}
                className="tiny semi row gap-3 center-v"
                style={{
                  fontSize: 11.5, padding: "2px 8px", borderRadius: 999, cursor: canReact ? "pointer" : "default",
                  background: isMine ? "var(--brand-50)" : "var(--ink-100)",
                  border: `1px solid ${isMine ? "var(--brand-200)" : "var(--ink-200)"}`,
                  color: isMine ? "var(--brand-800)" : "var(--ink-700)",
                }}
                disabled={!canReact}
                aria-pressed={isMine}
                aria-label={`${emoji} ${n}${isMine ? ", your reaction" : ""}`}
                onClick={() => onReact?.(isMine ? null : emoji)}
              >
                <span aria-hidden="true">{emoji}</span> {n}
              </button>
            );
          })}
          {canReact && (
            <button
              className="tiny semi"
              style={{ color: "var(--ink-500)", padding: "2px 7px", background: "none", border: "none", cursor: "pointer", fontSize: 12.5 }}
              onClick={() => setPickerOpen((v) => !v)}
              aria-expanded={pickerOpen}
              aria-label={t("cpd_add_reaction")}
            >
              {tallies.length > 0 ? "＋" : "＋ React"}
            </button>
          )}
          {canReply && (
            <button className="tiny semi" style={{ color: "var(--brand-700)", padding: "2px 6px", background: "none", border: "none", cursor: "pointer" }} onClick={onReply}>
              Reply
            </button>
          )}
          {hasMenu && (
            <button
              className="tiny semi"
              style={{ color: "var(--ink-500)", padding: "0 5px", background: "none", border: "none", cursor: "pointer", lineHeight: 1 }}
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-label={t("cpd_comment_actions")}
            >
              <DotsThree size={18} weight="bold" />
            </button>
          )}
        </div>

        {menuOpen && hasMenu && (
          <div
            className="col"
            style={{ marginTop: 5, marginLeft: 6, padding: 4, background: "var(--surface)", border: "1px solid var(--ink-200)", borderRadius: 12, width: "fit-content", minWidth: 152, boxShadow: "var(--shadow-sm)" }}
          >
            {canPin && (
              <button className="row gap-8 center-v semi" style={MENU_ITEM} onClick={() => { setMenuOpen(false); onTogglePin?.(); }}>
                <PushPin size={14} /> {pinned ? "Unpin" : "Pin as answer"}
              </button>
            )}
            {canEdit && (
              <button className="row gap-8 center-v semi" style={MENU_ITEM} onClick={() => { setMenuOpen(false); setEditingBody(c.body); }}>
                <Pencil size={14} /> Edit
              </button>
            )}
            {canReport && !isMine && (
              <button className="row gap-8 center-v semi" style={MENU_ITEM} onClick={() => { setMenuOpen(false); onReport?.(); }}>
                <Flag size={14} /> Report
              </button>
            )}
            {canDelete && (
              <button className="row gap-8 center-v semi" style={{ ...MENU_ITEM, color: "var(--red-600)" }} onClick={() => { setMenuOpen(false); onDelete?.(); }}>
                <Trash2 size={14} /> {isMine ? "Delete" : "Remove from my post"}
              </button>
            )}
          </div>
        )}

        {pickerOpen && canReact && (
          <div className="row gap-4 center-v" style={{ marginTop: 5, marginLeft: 6, padding: "5px 8px", background: "var(--surface)", border: "1px solid var(--ink-200)", borderRadius: 999, width: "fit-content", boxShadow: "var(--shadow-sm)" }}>
            {COMMENT_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", padding: "1px 3px", lineHeight: 1 }}
                aria-label={`React with ${emoji}`}
                onClick={() => {
                  setPickerOpen(false);
                  onReact?.(c.myReaction === emoji ? null : emoji);
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
