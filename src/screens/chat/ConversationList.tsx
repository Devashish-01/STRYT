import { lazy, Suspense, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { MessageCircle, Search, QrCode, X, ArrowLeft } from "@/components/Icons";
import { chatService, relativeTime, type ChatScope } from "@/services/engagement/chatService";
import { useQueryWithRealtime } from "@/hooks/useApi";
import { ListSkeleton } from "@/components/states";
import { EmptyState, SafeImg } from "@/components/common";
import { NoMessagesIllustration, NoResultsIllustration } from "@/components/illustrations";
import { useApp } from "@/store";

// Wraps the html5-qrcode camera library (~340kB) — deferred so it's only
// fetched when the user actually opens the scanner, not on every visit.
const QrScannerSheet = lazy(() => import("@/components/QrScannerSheet"));

const SCOPE_LABEL: Record<string, string> = {
  BUSINESS: "Business inbox",
  PROVIDER: "Provider inbox",
  CUSTOMER: "Personal inbox",
};

export default function ConversationList() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const rawScope = params.get("scope");
  const scopeId = params.get("id") ?? undefined;
  const scope: ChatScope | undefined =
    rawScope === "BUSINESS" || rawScope === "PROVIDER" || rawScope === "CUSTOMER"
      ? { scope: rawScope, id: scopeId }
      : undefined;
  const scopeKey = `${rawScope ?? ""}:${scopeId ?? ""}`;
  const { data: convs, loading } = useQueryWithRealtime(
    () => chatService.conversations(scope),
    "conversations",
    [scopeKey]
  );
  const [scanner, setScanner] = useState(false);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const filtered = q
    ? (convs ?? []).filter((c) =>
        (c.otherUser?.name ?? "").toLowerCase().includes(q) ||
        (c.lastMessagePreview ?? "").toLowerCase().includes(q)
      )
    : (convs ?? []);

  return (
    <div className="screen with-nav">
      <header className="appbar">
        {!searching && (
          <button
            className="icon-btn"
            onClick={() => nav(-1)}
            style={{ marginRight: 4 }}
            aria-label="Go back"
          >
            <ArrowLeft size={20} />
          </button>
        )}
        {searching ? (
          <input
            autoFocus
            className="input grow"
            placeholder="Search conversations…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ marginRight: 8, height: 38, borderRadius: 10 }}
          />
        ) : (
          <div className="grow" style={{ minWidth: 0 }}>
            <span className="bold" style={{ fontSize: 20, display: "block", lineHeight: 1.1 }}>Messages</span>
            {scope && (
              <span className="tiny muted" style={{ display: "block" }}>{SCOPE_LABEL[scope.scope]}</span>
            )}
          </div>
        )}
        <button
          className="icon-btn"
          onClick={() => setScanner(true)}
          style={{ marginRight: 8 }}
          aria-label="Scan QR Code"
        >
          <QrCode size={20} />
        </button>
        <button
          className="icon-btn"
          onClick={() => { setSearching((s) => !s); setQuery(""); }}
          aria-label={searching ? "Close search" : "Search conversations"}
        >
          {searching ? <X size={20} /> : <Search size={20} />}
        </button>
      </header>

      <div className="screen-scroll">
        {loading ? (
          <ListSkeleton count={4} />
        ) : (convs ?? []).length === 0 ? (
          <EmptyState
            illustration={<NoMessagesIllustration />}
            emoji="💬"
            title="No messages yet"
            text="Tap Message on a business or provider profile to start a conversation."
          />
        ) : filtered.length === 0 ? (
          <EmptyState illustration={<NoResultsIllustration />} emoji="🔍" title="No matches" text={`No conversations match "${query}".`} />
        ) : (
          <div>
            {filtered.map((c) => {
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
      {scanner && (
        <Suspense fallback={null}>
          <QrScannerSheet onClose={() => setScanner(false)} />
        </Suspense>
      )}
    </div>
  );
}
