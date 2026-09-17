import { useRef, useState } from "react";
import { X, Camera, ChevronRight, Plus } from "@/components/Icons";
import { communityService, uploadService } from "@/services";
import { useApp } from "@/store";
import ListingPickerSheet from "@/components/ListingPickerSheet";
import type { CommunityPost, CommentPolicy, PostTag } from "@/types";
import { haptics } from "@/lib/haptics";
import { MAX_POST_MEDIA, MIN_TITLE_LEN } from "@/lib/communityTypes";
import { addMedia, canAddMedia, postMedia, removeMediaAt } from "@/lib/communityPost";
import { COMMENT_POLICIES, COMMENT_POLICY_META, resolveCommentPolicy } from "@/lib/commentPolicy";
import { useI18n } from "@/lib/i18n";

export function EditPostSheet({ post, onClose, onSaved }: { post: CommunityPost; onClose: () => void; onSaved: (p: CommunityPost) => void }) {
  const { showToast } = useApp();
  const { t, tf } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(post.title);
  const [body, setBody] = useState(post.body ?? "");
  // Edits the whole photo list, not just the cover. Editing only `image` while
  // the card reads `media` would leave the two disagreeing about what the post
  // shows — postMedia() seeds this from whichever the row actually has.
  const [media, setMedia] = useState<string[]>(postMedia(post));
  const [imageAlt, setImageAlt] = useState(post.imageAlt ?? "");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  // Rich per-type fields and audience settings (20260930). These used to be
  // write-once: set in the composer, then permanently frozen. Closing comments
  // on a thread that turned nasty is the one that actually matters.
  const [lastSeen, setLastSeen] = useState(post.lastSeen ?? "");
  const [reward, setReward] = useState(post.reward ?? "");
  const [pickupNote, setPickupNote] = useState(post.pickupNote ?? "");
  const [taggedListing, setTaggedListing] = useState<PostTag | null>(post.taggedListing ?? null);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [commentPolicy, setCommentPolicy] = useState<CommentPolicy>(resolveCommentPolicy(post));
  const [hideLikeCount, setHideLikeCount] = useState(post.hideLikeCount === true);
  // Collapsed by default, mirroring the composer's "Post settings" row — the
  // current choice is stated on the row so it's never a setting you must open
  // just to read.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const canSave = title.trim().length >= MIN_TITLE_LEN && !saving && !uploading;
  const policyMeta = COMMENT_POLICY_META[commentPolicy];
  const showLostFound = post.type === "LOST_FOUND";
  const showGiveaway = post.type === "GIVEAWAY";
  const showTag = post.type === "RECOMMENDATION" || post.type === "SHOUTOUT";

  async function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!canAddMedia(media)) {
      showToast(tf("cpd_photo_limit", { n: MAX_POST_MEDIA }));
      return;
    }
    setUploading(true);
    try {
      const url = await uploadService.upload(file, "community");
      const res = addMedia(media, url);
      if (res.rejected === "AT_LIMIT") showToast(tf("cpd_photo_limit", { n: MAX_POST_MEDIA }));
      else setMedia(res.media);
    } catch {
      showToast(t("cpd_photo_upload_failed"));
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const alt = imageAlt.trim();
      // Only the fields this post's type actually shows are sent. Passing a
      // field the sheet never rendered would write the empty string it was
      // initialised with, silently clearing data the author never saw.
      await communityService.update(post.id, {
        title: title.trim(),
        body: body.trim(),
        media,
        imageAlt: media.length > 0 ? alt : null,
        ...(showLostFound ? { lastSeen: lastSeen.trim(), reward: reward.trim() } : {}),
        ...(showGiveaway ? { pickupNote: pickupNote.trim() } : {}),
        ...(showTag ? { taggedListing } : {}),
        commentPolicy,
        hideLikeCount,
      });
      onSaved({
        ...post,
        title: title.trim(),
        body: body.trim(),
        media,
        image: media[0],
        imageAlt: media.length > 0 && alt ? alt : undefined,
        ...(showLostFound ? { lastSeen: lastSeen.trim() || null, reward: reward.trim() || null } : {}),
        ...(showGiveaway ? { pickupNote: pickupNote.trim() || null } : {}),
        ...(showTag ? { taggedListing } : {}),
        commentPolicy,
        // The legacy mirror the RPC keeps in step server-side; kept in step here
        // too so the screen behind the sheet doesn't disagree until the refetch.
        allowComments: commentPolicy !== "OFF",
        hideLikeCount,
      });
      showToast(t("cpd_post_updated"));
    } catch {
      showToast(t("cpd_save_changes_failed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <h3 className="bold h2" style={{ marginBottom: 14 }}>{t("card_edit_post")}</h3>
        <div className="col gap-12">
          <div className="field">
            <label htmlFor="communitypostdetail-title">{t("cpd_title_label")}</label>
            <input id="communitypostdetail-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} />
          </div>
          <div className="field">
            <label htmlFor="communitypostdetail-details">{t("details")}</label>
            <textarea id="communitypostdetail-details" className="input" value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} />
          </div>
          <div className="field">
            <label className="row between">
              <span>{t("photos_label")}</span>
              <span className="tiny muted tabular-nums">{media.length}/{MAX_POST_MEDIA}</span>
            </label>
            <div className="media-strip">
              {media.map((url, i) => (
                <div key={url} className={`media-thumb ${i === 0 ? "media-thumb-cover" : ""}`}>
                  <img src={url} alt={i === 0 ? "Cover photo" : `Photo ${i + 1}`} />
                  {i === 0 && media.length > 1 && <span className="media-cover-tag">COVER</span>}
                  <button
                    type="button"
                    className="media-thumb-x"
                    aria-label={`Remove photo ${i + 1}`}
                    onClick={() => setMedia(removeMediaAt(media, i))}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              {canAddMedia(media) && (
                <button type="button" className="media-add" disabled={uploading} onClick={() => fileRef.current?.click()}>
                  <Camera size={20} /><span>{uploading ? "Uploading…" : "Add"}</span>
                </button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={pickPhoto} />
            {media.length > 0 && (
              <input
                className="input"
                style={{ marginTop: 9 }}
                placeholder={t("cpd_alt_placeholder")}
                aria-label={t("cpd_alt_aria")}
                value={imageAlt}
                maxLength={200}
                onChange={(e) => setImageAlt(e.target.value)}
              />
            )}
          </div>

          {/* Per-type fields, in the same shape and wording the composer uses —
              an author shouldn't have to relearn the form to correct it. */}
          {showLostFound && (
            <div className="field">
              <label htmlFor="communitypostdetail-where-reward">{t("cpd_where_reward_label")}</label>
              <div className="col gap-10">
                <input id="communitypostdetail-where-reward"
                  className="input"
                  placeholder={t("cpd_last_seen_placeholder")}
                  aria-label={t("cpd_last_seen_aria")}
                  value={lastSeen}
                  maxLength={120}
                  onChange={(e) => setLastSeen(e.target.value)}
                />
                <input
                  className="input"
                  placeholder={t("cpd_reward_placeholder")}
                  aria-label={t("cpd_reward_aria")}
                  value={reward}
                  maxLength={80}
                  onChange={(e) => setReward(e.target.value)}
                />
              </div>
            </div>
          )}

          {showGiveaway && (
            <div className="field">
              <label htmlFor="communitypostdetail-pickup">{t("cpd_pickup_field_label")}</label>
              <input id="communitypostdetail-pickup"
                className="input"
                placeholder={t("cpd_pickup_placeholder")}
                aria-label={t("cpd_pickup_aria")}
                value={pickupNote}
                maxLength={140}
                onChange={(e) => setPickupNote(e.target.value)}
              />
            </div>
          )}

          {showTag && (
            <div className="field">
              <label>{t("cpd_tagged_place")}</label>
              {taggedListing ? (
                <div className="row gap-10 center-v" style={{ padding: "9px 11px", background: "var(--surface)", border: "1px solid var(--ink-200)", borderRadius: 12 }}>
                  <span style={{ fontSize: 18 }} aria-hidden="true">{taggedListing.listingType === "BUSINESS" ? "🏪" : "👤"}</span>
                  <span className="semi small grow ellipsis">{taggedListing.name}</span>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={t("cpd_remove_tag")}
                    style={{ width: 26, height: 26 }}
                    onClick={() => setTaggedListing(null)}
                  >
                    <X size={13} />
                  </button>
                </div>
              ) : (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTagPickerOpen(true)}>
                  <Plus size={14} /> Choose a business or provider
                </button>
              )}
            </div>
          )}

          <div className="field" style={{ marginBottom: 0 }}>
            <button
              type="button"
              className="row between center-v"
              onClick={() => setSettingsOpen((v) => !v)}
              aria-expanded={settingsOpen}
              style={{ width: "100%", padding: "12px 14px", background: "var(--ink-50)", border: "1px solid var(--ink-200)", borderRadius: 14, cursor: "pointer", textAlign: "left" }}
            >
              <div className="col" style={{ gap: 2, minWidth: 0 }}>
                <span className="semi small">{t("cpd_post_settings")}</span>
                <span className="tiny muted ellipsis">
                  {policyMeta.emoji} {policyMeta.label} can reply
                  {hideLikeCount ? " · likes hidden" : ""}
                </span>
              </div>
              <ChevronRight
                size={16}
                color="var(--ink-500)"
                style={{ flexShrink: 0, transform: settingsOpen ? "rotate(90deg)" : "none", transition: "transform 0.2s ease" }}
              />
            </button>

            {settingsOpen && (
              <div className="col gap-8" style={{ marginTop: 10 }} role="radiogroup" aria-label={t("cpd_who_can_reply")}>
                {COMMENT_POLICIES.map((pol) => {
                  const on = commentPolicy === pol.value;
                  return (
                    <button
                      key={pol.value}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      className="row gap-10 center-v"
                      style={{
                        width: "100%", padding: "10px 12px", textAlign: "left", cursor: "pointer",
                        borderRadius: 13,
                        border: on ? "1.5px solid var(--brand-600)" : "1.5px solid var(--ink-200)",
                        background: on ? "var(--brand-50)" : "var(--surface)",
                      }}
                      onClick={() => { haptics.selection(); setCommentPolicy(pol.value); }}
                    >
                      <span style={{ fontSize: 17 }} aria-hidden="true">{pol.emoji}</span>
                      <span className="grow" style={{ minWidth: 0 }}>
                        <span className="semi small" style={{ display: "block", color: on ? "var(--brand-900)" : "var(--ink-900)" }}>{pol.label}</span>
                        <span className="tiny muted">{pol.hint}</span>
                      </span>
                      <span style={{
                        width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                        border: on ? "5px solid var(--brand-600)" : "2px solid var(--ink-300)",
                      }} />
                    </button>
                  );
                })}
                {commentPolicy === "OFF" && (post.commentsCount ?? 0) > 0 && (
                  <p className="tiny muted" style={{ lineHeight: 1.5 }}>
                    Existing replies stay visible — this only stops new ones.
                  </p>
                )}

                <div className="divider" style={{ margin: "5px 0" }} />

                <button
                  type="button"
                  className="row between center-v"
                  onClick={() => setHideLikeCount((v) => !v)}
                  aria-pressed={hideLikeCount}
                  style={{ width: "100%", background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0 }}
                >
                  <span className="col" style={{ gap: 2 }}>
                    <span className="semi small">{t("cpd_hide_like_count")}</span>
                    <span className="tiny muted">{t("cpd_hide_like_hint")}</span>
                  </span>
                  <span style={{
                    width: 44, height: 26, borderRadius: 999, flexShrink: 0, position: "relative",
                    background: hideLikeCount ? "var(--brand-600)" : "var(--ink-300)",
                    transition: "background 0.15s ease",
                  }}>
                    <span style={{
                      position: "absolute", top: 3, left: hideLikeCount ? 21 : 3,
                      width: 20, height: 20, borderRadius: "50%", background: "var(--white)",
                      transition: "left 0.15s ease", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                    }} />
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
        <button className="btn btn-primary btn-block" style={{ marginTop: 16 }} disabled={!canSave} onClick={save}>
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>

      {tagPickerOpen && (
        <ListingPickerSheet
          title={"Tag a place"}
          onPick={(pick) => { setTaggedListing(pick); setTagPickerOpen(false); }}
          onClose={() => setTagPickerOpen(false)}
        />
      )}
    </div>
  );
}

/** A comment body with its @mentions rendered as taps through to the profile.
 *  Unresolved mentions stay plain text — see parseBody. */
