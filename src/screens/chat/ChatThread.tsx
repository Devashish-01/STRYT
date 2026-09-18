import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Send, Phone, Image as ImageIcon, Check, DotsThree, Flag, Ban } from "@/components/Icons";
import { chatService, inboxScopeFor, MESSAGE_PAGE_SIZE } from "@/services/engagement/chatService";
import { uploadService } from "@/services";
import { socialService } from "@/services/engagement/socialService";
import { useQuery, useQueryWithRealtime } from "@/hooks/useApi";
import { SafeImg } from "@/components/common";
import { Skeleton } from "@/components/states";
import { useApp } from "@/store";
import LiveLocationCard from "@/features/live-share/LiveLocationCard";
import ReportSheet from "@/components/ReportSheet";
import PhotoViewer from "@/components/PhotoViewer";
import type { Message, Conversation } from "@/types";
import { useI18n } from "@/lib/i18n";
import { errorMessage } from "@/lib/errorMessage";

const TYPING_THROTTLE_MS = 2000;
const TYPING_HIDE_MS = 3000;

export default function ChatThread() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { t } = useI18n();
  const { user, setChatUnread, showToast } = useApp();
  const bottomRef = useRef<HTMLDivElement>(null);

  // Realtime, not plain useQuery — otherwise the other side marking this
  // thread read while both of you have it open never updates your own
  // "Seen" checkmark until you leave and reopen the screen. Same table/hook
  // ConversationList.tsx already uses for its own unread badges.
  const { data: convs, refetch: refetchConvs } = useQueryWithRealtime(
    () => chatService.conversations(),
    "conversations",
    [user.id],
    undefined,
    `chat:conversations:${user.id}:`,
  );
  const conv: Conversation | undefined = (convs ?? []).find((c) => c.id === id);

  const { data: initial, loading } = useQuery(() => chatService.messages(id), [id], `chat:messages:${id}`);
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const [activePhoto, setActivePhoto] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  // A long thread loads its most recent page and walks backwards from there (C8).
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [noEarlier, setNoEarlier] = useState(false);

  async function loadEarlier() {
    const oldest = messages[0];
    if (!oldest || loadingEarlier) return;
    setLoadingEarlier(true);
    try {
      const page = await chatService.messages(id, oldest.createdAt);
      if (page.length < MESSAGE_PAGE_SIZE) setNoEarlier(true);
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        return [...page.filter((m) => !seen.has(m.id)), ...prev];
      });
    } catch {
      showToast("Couldn't load earlier messages");
    } finally {
      setLoadingEarlier(false);
    }
  }

  const typingRef = useRef<{ send: (uid: string) => void; unsubscribe: () => void } | null>(null);
  const lastTypingSentRef = useRef(0);
  const typingHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const other = conv?.otherUser;

  // Seed messages from the query result.
  useEffect(() => {
    if (initial) setMessages(initial);
  }, [initial]);

  // Check if other user is blocked
  useEffect(() => {
    if (!other?.id) return;
    socialService.hasBlocked(other.id).then(setIsBlocked).catch(() => {});
  }, [other?.id]);

  // The effect below must run once per open thread, not once per conversations refetch: it used to depend on the
  // `conv` object, which is new on every refetch — markRead → refetch → new conv → markRead… (~45 requests/second,
  // realtime re-subscribed each time; E2E-013). It reads the latest conversation through this ref instead.
  const convRef = useRef<Conversation | undefined>(conv);
  convRef.current = conv;
  const convReady = !!conv;

  // Mark as read + subscribe to realtime (messages + typing) when conv is available.
  useEffect(() => {
    const conv = convRef.current;
    if (!conv) return;
    chatService.markRead(id, conv).then(() => {
      const scope = inboxScopeFor(conv, user.id);
      if (scope.scope === "CUSTOMER") {
        chatService.totalUnread({ scope: "CUSTOMER" }).then(setChatUnread);
      }
      refetchConvs();
    });

    const unsub = chatService.subscribe(id, (msg) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      // In-thread real-time message read auto-acknowledgment
      const latest = convRef.current;
      if (msg.senderId !== user.id && latest) {
        void chatService.markRead(id, latest);
      }
    });

    const typing = chatService.connectTyping(id, (uid) => {
      if (uid === user.id) return;
      setOtherTyping(true);
      if (typingHideTimer.current) clearTimeout(typingHideTimer.current);
      typingHideTimer.current = setTimeout(() => setOtherTyping(false), TYPING_HIDE_MS);
    });
    typingRef.current = typing;

    return () => {
      unsub();
      typing.unsubscribe();
      if (typingHideTimer.current) clearTimeout(typingHideTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, convReady, user.id, setChatUnread]);

  // Auto-scroll to bottom on new message.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, otherTyping]);

  function notifyTyping() {
    const now = Date.now();
    if (now - lastTypingSentRef.current < TYPING_THROTTLE_MS) return;
    lastTypingSentRef.current = now;
    typingRef.current?.send(user.id);
  }

  async function pickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingImage(true);
    try {
      setPendingImage(await uploadService.upload(file, "chat"));
    } catch {
      showToast("Failed to upload photo");
    } finally {
      setUploadingImage(false);
    }
  }

  async function send() {
    if ((!body.trim() && !pendingImage) || !conv || isBlocked) return;
    setSending(true);
    const text = body.trim();
    const image = pendingImage ?? undefined;
    setBody("");
    setPendingImage(null);

    const tempId = `optimistic-${Date.now()}`;
    const optimisticMsg: Message = {
      id: tempId,
      conversationId: id,
      senderId: user.id,
      body: text,
      imageUrl: image,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      const msg = await chatService.send(id, text, conv, image);
      setMessages((prev) => prev.map((m) => (m.id === tempId ? msg : m)));
    } catch (e) {
      setBody(text); // restore input on failure
      setPendingImage(image ?? null);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      showToast(errorMessage(e, "Failed to send message — tap to retry"));
    } finally {
      setSending(false);
    }
  }

  async function toggleBlock() {
    if (!other?.id) return;
    setMenuOpen(false);
    if (isBlocked) {
      try {
        await socialService.unblockUser(other.id);
        setIsBlocked(false);
        showToast(`Unblocked ${other.name}`);
      } catch (e) {
        showToast(errorMessage(e, "Failed to unblock user"));
      }
    } else {
      if (!window.confirm(`Block ${other.name}? They will no longer be able to message you.`)) return;
      try {
        await socialService.blockUser(other.id);
        setIsBlocked(true);
        showToast(`Blocked ${other.name}`);
      } catch (e) {
        showToast(errorMessage(e, "Failed to block user"));
      }
    }
  }

  const isA = conv ? user.id === conv.participantA : false;
  const otherLastReadAt = conv ? (isA ? conv.lastReadAtB : conv.lastReadAtA) : null;
  const lastMineIdx = [...messages].map((m) => m.senderId === user.id).lastIndexOf(true);
  const seenByOther = otherLastReadAt && lastMineIdx >= 0
    ? new Date(otherLastReadAt).getTime() >= new Date(messages[lastMineIdx].createdAt).getTime()
    : false;

  return (
    <div className="screen" style={{ display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <header className="appbar" style={{ borderBottom: "1px solid var(--line)", flexShrink: 0, position: "relative" }}>
        <button className="icon-btn" onClick={() => nav(-1)} aria-label={t("go_back")}>
          <ArrowLeft size={20} />
        </button>
        <button
          className="row gap-8 grow"
          style={{ minWidth: 0, background: "none", border: "none", alignItems: "center", textAlign: "left", cursor: other ? "pointer" : "default" }}
          onClick={() => other && nav(other.profilePath)}
          disabled={!other}
        >
          <SafeImg
            src={other?.avatar}
            variant="avatar"
            className="avatar"
            style={{ width: 36, height: 36, marginRight: 2 }}
          />
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="semi" style={{ fontSize: 15, lineHeight: 1.2 }}>{other?.name ?? "Chat"}</div>
            {other && <div className="tiny muted" style={{ lineHeight: 1.2 }}>{t("view_profile")}</div>}
          </div>
        </button>

        {other && (
          <div className="row gap-4 center-v" style={{ position: "relative" }}>
            <button
              className="icon-btn"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="More options"
            >
              <DotsThree size={20} />
            </button>

            {menuOpen && (
              <div
                className="card col"
                style={{
                  position: "absolute",
                  top: "100%",
                  right: 0,
                  zIndex: 100,
                  minWidth: 160,
                  padding: "4px 0",
                  background: "var(--surface)",
                  boxShadow: "var(--shadow-md)",
                  border: "1px solid var(--line)",
                  borderRadius: 12,
                }}
              >
                <button
                  className="row gap-8 center-v small"
                  style={{ padding: "10px 14px", background: "none", border: "none", width: "100%", textAlign: "left", cursor: "pointer" }}
                  onClick={() => { setMenuOpen(false); nav(other.profilePath); }}
                >
                  <Phone size={15} /> {other.kind === "business" ? t("chat_view_business") : other.kind === "provider" ? t("chat_view_provider") : "View contact"}
                </button>
                <button
                  className="row gap-8 center-v small"
                  style={{ padding: "10px 14px", background: "none", border: "none", width: "100%", textAlign: "left", cursor: "pointer", color: "var(--red-600)" }}
                  onClick={() => { setMenuOpen(false); setReporting(true); }}
                >
                  <Flag size={15} /> Report chat
                </button>
                <button
                  className="row gap-8 center-v small"
                  style={{ padding: "10px 14px", background: "none", border: "none", width: "100%", textAlign: "left", cursor: "pointer", color: isBlocked ? "var(--green-600)" : "var(--red-600)" }}
                  onClick={toggleBlock}
                >
                  <Ban size={15} /> {isBlocked ? "Unblock user" : "Block user"}
                </button>
              </div>
            )}
          </div>
        )}
      </header>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "12px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          paddingBottom: "calc(90px + var(--safe-area-bottom))",
        }}
      >
        {loading && <Skeleton h={40} />}

        {!loading && !noEarlier && messages.length >= MESSAGE_PAGE_SIZE && (
          <div className="row center" style={{ padding: "4px 0 10px" }}>
            <button className="btn btn-outline btn-sm" disabled={loadingEarlier} onClick={() => void loadEarlier()}>
              {loadingEarlier ? "Loading…" : "Load earlier messages"}
            </button>
          </div>
        )}

        {messages.map((msg, i) => {
          const isMe = msg.senderId === user.id;
          const isLastMine = isMe && i === lastMineIdx;
          const shareId = msg.kind === "LIVE_LOCATION"
            ? (msg.meta?.share_id ?? msg.meta?.shareId)
            : null;
          return (
            <div
              key={msg.id}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: isMe ? "flex-end" : "flex-start",
              }}
            >
              {shareId ? (
                <LiveLocationCard shareId={shareId} endedHint={(msg.meta?.status) === "ENDED"} />
              ) : (
                <>
                  {msg.imageUrl && (
                    <img
                      src={msg.imageUrl}
                      alt=""
                      style={{ maxWidth: "60%", borderRadius: 14, marginBottom: msg.body ? 4 : 0, cursor: "pointer" }}
                      onClick={() => setActivePhoto(msg.imageUrl!)}
                    />
                  )}
                  {msg.body && (
                    <div
                      style={{
                        maxWidth: "75%",
                        padding: "10px 14px",
                        borderRadius: isMe ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                        background: isMe ? "var(--brand-600)" : "var(--ink-100)",
                        color: isMe ? "var(--white)" : "var(--ink-900)",
                        fontSize: 15,
                        lineHeight: 1.45,
                        wordBreak: "break-word",
                      }}
                    >
                      {msg.body}
                    </div>
                  )}
                </>
              )}
              <span className="tiny muted row gap-4" style={{ marginTop: 3, paddingInline: 4, alignItems: "center" }}>
                {new Date(msg.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                {isLastMine && seenByOther && (
                  <span className="row gap-2" style={{ color: "var(--brand-600)", alignItems: "center" }}>
                    <Check size={12} /> {t("seen")}
                  </span>
                )}
              </span>
            </div>
          );
        })}

        {otherTyping && (
          <div style={{ display: "flex", alignItems: "flex-start" }}>
            <div style={{ padding: "10px 14px", borderRadius: "18px 18px 18px 4px", background: "var(--ink-100)" }}>
              <span className="tiny muted">{t("is_typing").replace("{name}", other?.name ?? "Typing")}</span>
            </div>
          </div>
        )}

        {messages.length === 0 && !loading && (
          <div style={{ textAlign: "center", color: "var(--ink-400)", paddingTop: 40 }}>
            <span style={{ fontSize: 36 }}>👋</span>
            <p className="small muted" style={{ marginTop: 8 }}>{t("say_hello_to").replace("{name}", other?.name ?? "them")}</p>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar or blocked notification */}
      {isBlocked ? (
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            background: "var(--surface)",
            borderTop: "1px solid var(--line)",
            padding: "14px 16px calc(14px + var(--safe-area-bottom))",
            textAlign: "center",
          }}
        >
          <span className="small muted">
            You have blocked this user.{" "}
            <button
              type="button"
              className="inline-link semi"
              style={{ color: "var(--brand-600)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
              onClick={toggleBlock}
            >
              Unblock
            </button>{" "}
            to resume messaging.
          </span>
        </div>
      ) : (
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            background: "var(--surface)",
            borderTop: "1px solid var(--line)",
            padding: "10px 12px calc(10px + var(--safe-area-bottom))",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {pendingImage && (
            <div style={{ position: "relative", width: 64 }}>
              <img src={pendingImage} alt="" style={{ width: 64, height: 64, borderRadius: 10, objectFit: "cover" }} />
              <button
                onClick={() => setPendingImage(null)}
                aria-label="Remove photo"
                style={{
                  position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%",
                  background: "var(--ink-700)", color: "var(--white)", display: "flex", alignItems: "center", justifyContent: "center",
                  border: "2px solid var(--surface)", fontSize: 12, lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
          )}
          <div className="row gap-10" style={{ alignItems: "flex-end" }}>
            <label
              className="icon-btn"
              style={{ flexShrink: 0, cursor: uploadingImage ? "default" : "pointer", opacity: uploadingImage ? 0.5 : 1 }}
              aria-label="Attach photo"
            >
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={pickImage} disabled={uploadingImage || sending} />
              <ImageIcon size={20} color="var(--ink-500)" />
            </label>
            <textarea
              className="input"
              placeholder={t("type_message")}
              value={body}
              rows={1}
              style={{
                flex: 1,
                resize: "none",
                maxHeight: 100,
                overflowY: "auto",
                padding: "10px 14px",
                borderRadius: 22,
                lineHeight: 1.4,
              }}
              onChange={(e) => {
                setBody(e.target.value);
                notifyTyping();
                // Auto-grow
                e.target.style.height = "auto";
                e.target.style.height = e.target.scrollHeight + "px";
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              disabled={sending}
            />
            <button
              onClick={send}
              disabled={(!body.trim() && !pendingImage) || sending || uploadingImage}
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                background: (body.trim() || pendingImage) ? "var(--brand-600)" : "var(--ink-200)",
                color: "var(--white)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                border: "none",
                cursor: (body.trim() || pendingImage) ? "pointer" : "default",
                transition: "background 0.15s",
              }}
            >
              <Send size={18} style={{ transform: "translateX(1px)" }} />
            </button>
          </div>
        </div>
      )}

      {/* Full-screen photo viewer */}
      {activePhoto && (
        <PhotoViewer
          photos={[{ url: activePhoto }]}
          startIndex={0}
          onClose={() => setActivePhoto(null)}
        />
      )}

      {/* In-app user reporting sheet */}
      {reporting && other && (
        <ReportSheet
          targetType="USER"
          targetId={other.id}
          name={other.name}
          onClose={() => setReporting(false)}
        />
      )}
    </div>
  );
}
