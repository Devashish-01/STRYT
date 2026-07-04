import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Send, Phone } from "lucide-react";
import { chatService } from "@/services/engagement/chatService";
import { useQuery } from "@/hooks/useApi";
import { SafeImg } from "@/components/common";
import { Skeleton } from "@/components/states";
import { useApp } from "@/store";
import type { Message, Conversation } from "@/types";

export default function ChatThread() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { user, setChatUnread } = useApp();
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: convs } = useQuery(() => chatService.conversations(), []);
  const conv: Conversation | undefined = (convs ?? []).find((c) => c.id === id);

  const { data: initial, loading } = useQuery(() => chatService.messages(id), [id]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  // Seed messages from the query result.
  useEffect(() => {
    if (initial) setMessages(initial);
  }, [initial]);

  // Mark as read + subscribe to realtime when conv is available.
  useEffect(() => {
    if (!conv) return;
    chatService.markRead(id, conv).then(() => {
      chatService.totalUnread().then(setChatUnread);
    });
    const unsub = chatService.subscribe(id, (msg) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    });
    return unsub;
  }, [id, conv]);

  // Auto-scroll to bottom on new message.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    if (!body.trim() || !conv) return;
    setSending(true);
    const text = body.trim();
    setBody("");
    try {
      const msg = await chatService.send(id, text, conv);
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    } catch {
      setBody(text); // restore on failure
    } finally {
      setSending(false);
    }
  }

  const other = conv?.otherUser;

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
            {other && <div className="tiny muted" style={{ lineHeight: 1.2 }}>View profile</div>}
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

        {messages.map((msg) => {
          const isMe = msg.senderId === user.id;
          return (
            <div
              key={msg.id}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: isMe ? "flex-end" : "flex-start",
              }}
            >
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
              <span className="tiny muted" style={{ marginTop: 3, paddingInline: 4 }}>
                {new Date(msg.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          );
        })}

        {messages.length === 0 && !loading && (
          <div style={{ textAlign: "center", color: "var(--ink-400)", paddingTop: 40 }}>
            <span style={{ fontSize: 36 }}>👋</span>
            <p className="small muted" style={{ marginTop: 8 }}>Say hello to {other?.name ?? "them"}!</p>
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
          gap: 10,
          alignItems: "flex-end",
        }}
      >
        <textarea
          className="input"
          placeholder="Type a message…"
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
          disabled={!body.trim() || sending}
          style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            background: body.trim() ? "var(--brand-600)" : "var(--ink-200)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            border: "none",
            cursor: body.trim() ? "pointer" : "default",
            transition: "background 0.15s",
          }}
        >
          <Send size={18} style={{ transform: "translateX(1px)" }} />
        </button>
      </div>
    </div>
  );
}
