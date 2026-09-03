import { useState } from "react";
import { X, Send, MessageCircle } from "@/components/Icons";
import { SafeImg, EmptyState } from "@/components/common";
import { ListSkeleton } from "@/components/states";
import { chatService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { useApp } from "@/store";
import { useI18n } from "@/lib/i18n";
import type { Conversation } from "@/types";

/**
 * Send a shared link into an existing 1:1 conversation.
 *
 * The missing channel: STRYT is a neighbourhood app, so the highest-intent
 * share is usually to one specific neighbour — but every share bounced out to
 * WhatsApp or the clipboard, and nothing could stay inside the app.
 *
 * Deliberately only lists conversations that already exist rather than being a
 * full user picker: starting a brand-new thread by pasting a link into it is a
 * colder interaction than the chat flows the app already has (message a
 * business from its listing, reply to a proposal), and a user search here would
 * be a second, unrelated feature.
 */
export default function ShareToChatSheet({
  message, onSent, onClose,
}: { message: string; onSent?: () => void; onClose: () => void }) {
  const { showToast } = useApp();
  const { t } = useI18n();
  const [sendingId, setSendingId] = useState<string | null>(null);

  const { data, loading } = useQuery(() => chatService.conversations(), [], undefined);
  const conversations = data ?? [];

  async function sendTo(conv: Conversation) {
    setSendingId(conv.id);
    try {
      await chatService.send(conv.id, message, conv);
      showToast(t("shared_to_chat_toast"));
      onSent?.();
      onClose();
    } catch (e: any) {
      showToast(e?.message || t("couldnt_send_try_again"));
    } finally {
      setSendingId(null);
    }
  }

  return (
    <div className="overlay" style={{ zIndex: 130 }} onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={t("send_to_chat")}>
        <div className="sheet-grab" />
        <div className="row between center-v" style={{ marginBottom: 14 }}>
          <div className="row gap-8 center-v">
            <MessageCircle size={20} color="var(--brand-700)" />
            <h3 className="bold h2">{t("send_to_chat")}</h3>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label={t("close_word")}><X size={20} /></button>
        </div>

        {loading ? (
          <ListSkeleton count={3} />
        ) : conversations.length === 0 ? (
          <EmptyState emoji="💬" title={t("no_chats_yet")} text={t("no_chats_share_desc")} />
        ) : (
          <div className="col gap-8" style={{ maxHeight: "56vh", overflowY: "auto" }}>
            {conversations.map((c) => (
              <button
                key={c.id}
                className="card row gap-10 center-v"
                style={{ padding: 12, textAlign: "left" }}
                disabled={sendingId !== null}
                onClick={() => sendTo(c)}
              >
                <SafeImg
                  src={c.otherUser?.avatar}
                  variant="avatar"
                  style={{ width: 38, height: 38, flexShrink: 0 }}
                />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="semi small ellipsis">{c.otherUser?.name || t("stryt_user_fallback")}</div>
                  {c.lastMessagePreview && (
                    <div className="tiny muted ellipsis">{c.lastMessagePreview}</div>
                  )}
                </div>
                <Send size={16} color={sendingId === c.id ? "var(--ink-300)" : "var(--brand-700)"} style={{ flexShrink: 0 }} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
