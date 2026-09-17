import { Heart, MessageCircle, CheckCircle2 } from "@/components/Icons";
import type { CommunityPost } from "@/types";
import { SafeImg } from "../common";
import { useI18n } from "@/lib/i18n";
import { COMMUNITY_TYPE_META } from "@/lib/communityTypes";
import { SEVERITY_TONE, postMedia, severityMeta } from "@/lib/communityPost";

/* ---------------- Community card ---------------- */

/**
 * Compact one-line-plus summary of a post, for the "list of posts" contexts that
 * aren't the feed: My Activity, and a provider's Posts tab.
 *
 * Those two screens had byte-identical inline markup, and because it was
 * hand-rolled in each it silently missed everything the feed card gained —
 * a post's type rendered as the raw enum (`LOST_FOUND`), a multi-photo post
 * showed nothing but its cover, and a resolved lost-and-found looked
 * indistinguishable from an open one. This is deliberately NOT CommunityCard:
 * these are dense list rows, not feed cards, and they shouldn't carry
 * like/save/share controls.
 */
export function PostSummaryRow({ post, onClick }: { post: CommunityPost; onClick: () => void }) {
  const { t } = useI18n();
  const M = COMMUNITY_TYPE_META[post.type];
  const media = postMedia(post);
  const sev = post.type === "ALERT" && post.severity ? severityMeta(post.severity) : null;
  return (
    <button className="card col gap-6" style={{ padding: 14, textAlign: "left" }} onClick={onClick}>
      <div className="row between gap-8 center-v">
        {/* Falls back to the human label, never the raw enum. */}
        <span className="semi small ellipsis">{post.title || `${M.emoji} ${M.label}`}</span>
        <span className="tiny muted" style={{ flexShrink: 0 }}>{post.postedAt}</span>
      </div>
      <div className="row gap-6 center-v wrap">
        <span className={`badge badge-${sev ? SEVERITY_TONE[post.severity!] : M.tone}`} style={{ fontSize: 10.5, padding: "2px 8px", borderRadius: 8 }}>
          {sev ? `${sev.emoji} ${sev.label}` : `${M.emoji} ${M.label}`}
        </span>
        {post.resolved && (
          <span className="badge badge-green" style={{ fontSize: 10.5, padding: "2px 8px", borderRadius: 8 }}>
            <CheckCircle2 size={10} /> Resolved
          </span>
        )}
      </div>
      {post.body && <p className="small muted clamp-2" style={{ lineHeight: 1.5 }}>{post.body}</p>}
      {media.length > 0 && (
        <div style={{ position: "relative" }}>
          <SafeImg src={media[0]} alt={post.imageAlt || ""} style={{ width: "100%", height: 150, borderRadius: 12, objectFit: "cover" }} />
          {media.length > 1 && (
            <span
              className="tiny semi"
              style={{ position: "absolute", top: 8, right: 8, padding: "2px 8px", borderRadius: 9, color: "var(--white)", background: "rgba(26, 21, 48, 0.72)", fontSize: 11 }}
            >
              1/{media.length}
            </span>
          )}
        </div>
      )}
      <div className="row gap-14 tiny muted" style={{ marginTop: 2 }}>
        <span className="row gap-4"><Heart size={13} /> {post.likes}</span>
        <span className="row gap-4"><MessageCircle size={13} /> {post.commentsCount}</span>
      </div>
    </button>
  );
}
