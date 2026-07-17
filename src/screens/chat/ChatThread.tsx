import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Send, Phone, Image as ImageIcon, Check } from "@/components/Icons";
import { chatService } from "@/services/engagement/chatService";
import { uploadService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { SafeImg } from "@/components/common";
import { Skeleton } from "@/components/states";
import { useApp } from "@/store";
import LiveLocationCard from "@/features/live-share/LiveLocationCard";
import type { Message, Conversation } from "@/types";
import { useI18n } from "@/lib/i18n";

const TYPING_THROTTLE_MS = 2000;
const TYPING_HIDE_MS = 3000;

export default function ChatThread() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { t } = useI18n();
  const { user, setChatUnread, showToast } = useApp();
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: convs, refetch: refetchConvs } = useQuery(() => chatService.conversations(), []);
  const conv: Conversation | undefined = (convs ?? []).find((c) => c.id === id);

  const { data: initial, loading } = useQuery(() => chatService.messages(id), [id]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const typingRef = useRef<{ send: (uid: string) => void; unsubscribe: () => void } | null>(null);
  const lastTypingSentRef = useRef(0);
  const typingHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Seed messages from the query result.
  useEffect(() => {
    if (initial) setMessages(initial);
  }, [initial]);

  // Mark as read + subscribe to realtime (messages + typing) when conv is available.
  useEffect(() => {
    if (!conv) return;
    chatService.markRead(id, conv).then(() => {
      // setChatUnread feeds the customer-scoped badge (store.tsx hydrates it with
      // the same CUSTOMER scope) — an unscoped total here overwrote that badge
      // with an all-roles count whenever a business/provider chat was opened.
      chatService.totalUnread({ scope: "CUSTOMER" }).then(setChatUnread);
      refetchConvs();
    });
    const unsub = chatService.subscribe(id, (msg) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
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
  }, [id, conv]);

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
    if ((!body.trim() && !pendingImage) || !conv) return;
    setSending(true);
    const text = body.trim();
    const image = pendingImage ?? undefined;
    setBody("");
    setPendingImage(null);
    try {
      const msg = await chatService.send(id, text, conv, image);
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    } catch {
      setBody(text); // restore on failure
      setPendingImage(image ?? null);
    } finally {
      setSending(false);
    }
  }

  const other = conv?.otherUser;
  const isA = conv ? user.id === conv.participantA : false;
  const otherLastReadAt = conv ? (isA ? conv.lastReadAtB : conv.lastReadAtA) : null;
  const lastMineIdx = [...messages].map((m) => m.senderId === user.id).lastIndexOf(true);
  const seenByOther = otherLastReadAt && lastMineIdx >= 0
    ? new Date(otherLastReadAt).getTime() >= new Date(messages[lastMineIdx].createdAt).getTime()
    : false;

  return (
    <div className="screen" style={{ display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <header className="appbar" style={{ borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
        <button className="icon-btn" onClick={() => nav(-1)}><ArrowLeft size={20} /></button>
        <button
          className="row gap-8 grow"
          style={{ minWidth: 0, background: "none", border: "none", alignItems: "center", textAlign: "left", cursor: other ? "pointer" : "default" }}
          onClick={() => other && nav(`/u/${other.id}`)}
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
          <button className="icon-btn" onClick={() => nav(`/u/${other.id}`)} aria-label="View profile & contact">
            <Phone size={18} />
          </button>
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
          paddingBottom: 80,
        }}
      >
        {loading && <Skeleton h={40} />}

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
                  onClick={() => window.open(msg.imageUrl!, "_blank")}
                />
              )}
              {msg.body && (
                <div
                  style={{
                    maxWidth: "75%",
                    padding: "10px 14px",
                    borderRadius: isMe ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                    background: isMe ? "var(--brand-600)" : "var(--ink-100)",
                    color: isMe ? "#fff" : "var(--ink-900)",
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

      {/* Input bar */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          background: "#fff",
          borderTop: "1px solid var(--line)",
          padding: "10px 12px",
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
                background: "var(--ink-700)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                border: "2px solid #fff", fontSize: 12, lineHeight: 1,
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
              color: "#fff",
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
    </div>
  );
}
