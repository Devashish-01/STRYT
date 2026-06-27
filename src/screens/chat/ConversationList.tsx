import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MessageCircle, Search, QrCode } from "lucide-react";
import { chatService, relativeTime } from "@/services/chatService";
import { useQuery } from "@/hooks/useApi";
import { ListSkeleton } from "@/components/states";
import { EmptyState, SafeImg } from "@/components/common";
import { useApp } from "@/store";
import QrScannerSheet from "@/components/QrScannerSheet";

export default function ConversationList() {
  const nav = useNavigate();
  const { data: convs, loading } = useQuery(() => chatService.conversations(), []);
  const [scanner, setScanner] = useState(false);

  return (
    <div className="screen with-nav">
      <header className="appbar">
        <span className="bold grow" style={{ fontSize: 20 }}>Messages</span>
        <button
          className="icon-btn"
          onClick={() => setScanner(true)}
          style={{ marginRight: 8 }}
          aria-label="Scan QR Code"
        >
          <QrCode size={20} />
        </button>
        <button className="icon-btn" onClick={() => {}}><Search size={20} /></button>
      </header>

      <div className="screen-scroll">
        {loading ? (
          <ListSkeleton count={4} />
        ) : (convs ?? []).length === 0 ? (
          <EmptyState
            emoji="💬"
            title="No messages yet"
            text="Tap Message on a business or provider profile to start a conversation."
          />
        ) : (
          <div>
            {(convs ?? []).map((c) => {
              const other = c.otherUser;
              const unread = c.hasUnreadA || c.hasUnreadB;
              return (
                <button
                  key={c.id}
                  onClick={() => nav(`/chat/${c.id}`)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "14px 16px",
                    borderBottom: "1px solid var(--line)",
                    background: unread ? "var(--brand-50)" : "#fff",
                    textAlign: "left",
                  }}
                >
                  {/* Avatar */}
                  <div style={{ position: "relative", flexShrink: 0 }}>
                    <SafeImg
                      src={other?.avatar}
                      variant="avatar"
                      className="avatar"
                      style={{ width: 50, height: 50 }}
                    />
                    {unread && (
                      <span style={{
                        position: "absolute",
                        top: 1,
                        right: 1,
                        width: 12,
                        height: 12,
                        borderRadius: "50%",
                        background: "var(--brand-600)",
                        border: "2px solid #fff",
                      }} />
                    )}
                  </div>

                  {/* Info */}
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="row between">
                      <span className={`semi ${unread ? "" : ""}`} style={{ fontSize: 15, fontWeight: unread ? 700 : 600 }}>
                        {other?.name ?? "Unknown"}
                      </span>
                      <span className="tiny muted">{relativeTime(c.lastMessageAt)}</span>
                    </div>
                    <p
                      className="small"
                      style={{
                        marginTop: 2,
                        color: unread ? "var(--ink-700)" : "var(--ink-500)",
                        fontWeight: unread ? 600 : 400,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {c.lastMessagePreview || "Start a conversation"}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
        <div style={{ height: 20 }} />
      </div>
      {scanner && <QrScannerSheet onClose={() => setScanner(false)} />}
    </div>
  );
}
