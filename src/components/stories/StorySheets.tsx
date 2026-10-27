import { useState } from "react";
import type { ReactNode } from "react";
import { Globe, Star, X } from "@/components/Icons";
import { SafeImg } from "@/components/common";
import { useI18n } from "@/lib/i18n";
import type { Story } from "@/types";
import type { StoryViewerRow, PrivacyUser } from "./useStoryViews";

/** A click on the dim backdrop itself (not on the sheet) — also what Android BACK triggers via data-back-close. */
const onBackdrop = (close: () => void) => (e: React.MouseEvent<HTMLElement>) => {
  if (e.target === e.currentTarget) close();
};

export interface MenuItem {
  key: string;
  icon: ReactNode;
  label: string;
  hint?: string;
  danger?: boolean;
  onClick: () => void;
}

/** The ⋯ menu: a short list of actions, dark like the viewer. */
export function StoryMenuSheet({ items, onClose }: { items: MenuItem[]; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <div className="sv-sheet-back" data-back-close onClick={onBackdrop(onClose)}>
      <div className="sv-sheet" role="menu">
        <div className="sv-sheet-grab" />
        {items.map((it) => (
          <button key={it.key} role="menuitem" className={`sv-row${it.danger ? " danger" : ""}`} onClick={it.onClick}>
            <span className="sv-row-ico" aria-hidden="true">{it.icon}</span>
            <span className="sv-row-txt">
              <span className="sv-row-label">{it.label}</span>
              {it.hint && <span className="sv-row-hint">{it.hint}</span>}
            </span>
          </button>
        ))}
        <button className="sv-row cancel" onClick={onClose}>{t("story_menu_cancel")}</button>
      </div>
    </div>
  );
}

/** "Are you sure?" for the two things that cannot be taken back: deleting a story and blocking a person. */
export function StoryConfirm({
  title, body, confirmLabel, busy, onConfirm, onClose,
}: { title: string; body: string; confirmLabel: string; busy?: boolean; onConfirm: () => void; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <div className="sv-sheet-back center" data-back-close onClick={onBackdrop(onClose)}>
      <div className="sv-confirm" role="alertdialog" aria-labelledby="sv-confirm-title">
        <h3 id="sv-confirm-title">{title}</h3>
        <p>{body}</p>
        <div className="sv-confirm-actions">
          <button className="sv-btn ghost" onClick={onClose} disabled={busy}>{t("story_menu_cancel")}</button>
          <button className="sv-btn danger" onClick={onConfirm} disabled={busy}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

/** The author's view of a story: who watched (with their reaction) and who it was shared with. */
export function StoryDetailsSheet({
  story, viewers, loading, privacyUsers, loadingPrivacy, onClose,
}: {
  story: Story;
  viewers: StoryViewerRow[];
  loading: boolean;
  privacyUsers: PrivacyUser[];
  loadingPrivacy: boolean;
  onClose: () => void;
}) {
  const { t, tf } = useI18n();
  const [tab, setTab] = useState<"viewers" | "privacy">("viewers");
  const close = story.visibility === "close_friends";
  const reactions = viewers.reduce<Record<string, number>>((m, v) => (v.reaction ? { ...m, [v.reaction]: (m[v.reaction] ?? 0) + 1 } : m), {});
  const reactionEntries = Object.entries(reactions);

  return (
    <div className="sv-sheet-back" data-back-close onClick={onBackdrop(onClose)}>
      <div className="sv-sheet tall">
        <div className="sv-sheet-grab" />
        <div className="sv-sheet-head">
          <h2>{t("story_details")}</h2>
          <button className="sv-x" onClick={onClose} aria-label={t("story_menu_cancel")}><X size={18} /></button>
        </div>
        <div className="sv-tabs" role="tablist">
          <button role="tab" aria-selected={tab === "viewers"} className={tab === "viewers" ? "on" : ""} onClick={() => setTab("viewers")}>
            {tf("story_viewers_n", { n: viewers.length })}
          </button>
          <button role="tab" aria-selected={tab === "privacy"} className={tab === "privacy" ? "on" : ""} onClick={() => setTab("privacy")}>
            {t("story_audience")}
          </button>
        </div>

        <div className="sv-sheet-scroll">
          {tab === "viewers" && (
            <>
              {reactionEntries.length > 0 && (
                <div className="sv-reaction-sum">
                  {reactionEntries.map(([emoji, n]) => <span key={emoji}>{emoji} {n}</span>)}
                </div>
              )}
              {loading ? (
                <p className="sv-empty">{t("story_loading_viewers")}</p>
              ) : viewers.length === 0 ? (
                <p className="sv-empty">{t("story_no_views")}</p>
              ) : (
                viewers.map((v) => (
                  <div key={v.userId} className="sv-person">
                    <SafeImg src={v.avatar} variant="avatar" style={{ width: 40, height: 40 }} />
                    <span className="sv-person-name">{v.name}</span>
                    {v.reaction && <span className="sv-person-react">{v.reaction}</span>}
                    <span className="sv-person-when">{v.when}</span>
                  </div>
                ))
              )}
            </>
          )}

          {tab === "privacy" && (
            <>
              <div className="sv-audience">
                <span className={`sv-audience-ico ${close ? "close" : ""}`}>
                  {close ? <Star size={16} weight="fill" /> : <Globe size={16} />}
                </span>
                <span className="sv-person-name">
                  {close ? t("story_close_only") : t("story_public")}
                  <small>{close ? t("story_close_hint") : t("story_public_hint")}</small>
                </span>
              </div>
              <p className="sv-section">
                {close
                  ? tf("story_allowed_n", { n: story.allowedUserIds?.length ?? 0 })
                  : tf("story_hidden_from_n", { n: story.hiddenUserIds?.length ?? 0 })}
              </p>
              {loadingPrivacy ? (
                <p className="sv-empty">{t("story_loading_lists")}</p>
              ) : privacyUsers.length === 0 ? (
                <p className="sv-empty">{close ? t("story_no_close") : t("story_not_hidden")}</p>
              ) : (
                privacyUsers.map((u) => (
                  <div key={u.id} className="sv-person">
                    <SafeImg src={u.avatar} variant="avatar" style={{ width: 32, height: 32 }} />
                    <span className="sv-person-name">{u.name}</span>
                  </div>
                ))
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
