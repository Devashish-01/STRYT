import { useNavigate } from "react-router-dom";
import { AppBar, SafeImg } from "@/components/common";
import { ListSkeleton } from "@/components/states";
import { useQuery } from "@/hooks/useApi";
import { useApp } from "@/store";
import { useLiveShare } from "@/features/live-share/useLiveShare";
import { emergencyService, type ContactUser } from "@/services/engagement/emergencyService";
import { MapPin, ChevronRight, Users } from "@/components/Icons";

/**
 * Safety hub — start/stop sharing your live location with your emergency
 * contacts, and jump to managing them. Reached from Home and the account menu.
 */
export default function SafetyHub() {
  const nav = useNavigate();
  const { showToast } = useApp();
  const { activeShareId, busy, start, stop } = useLiveShare();

  const { data: contacts, loading } = useQuery<ContactUser[]>(
    () => emergencyService.listContacts(), []
  );
  const list = contacts ?? [];
  const sharing = !!activeShareId;

  async function onStart() {
    if (list.length === 0) { nav("/safety/contacts"); return; }
    const id = await start();
    showToast(id ? "Live location shared with your contacts" : "Couldn't start sharing");
  }

  async function onStop() {
    await stop();
    showToast("Live location sharing stopped");
  }

  return (
    <div className="screen">
      <AppBar title="Safety" onBack={() => nav(-1)} />

      <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Hero: the big share control */}
        <div
          className="card"
          style={{
            padding: 20, textAlign: "center",
            background: sharing
              ? "linear-gradient(160deg, var(--accent-500), var(--pink-500))"
              : "linear-gradient(160deg, var(--brand-500), var(--brand-700))",
            color: "#fff",
          }}
        >
          <div style={{
            width: 60, height: 60, borderRadius: "50%", margin: "0 auto 12px",
            background: "rgba(255,255,255,0.16)", display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <MapPin size={28} color="#fff" />
          </div>
          <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 4 }}>
            {sharing ? "You're sharing live location" : "Share your live location"}
          </div>
          <div style={{ fontSize: 13, opacity: 0.85, lineHeight: 1.5, marginBottom: 18 }}>
            {sharing
              ? "Your contacts can follow you on the map in their chat with you, until you stop."
              : "Your emergency contacts can follow you on the map in real time, until you turn it off."}
          </div>
          <button
            onClick={() => void (sharing ? onStop() : onStart())}
            disabled={busy}
            style={{
              width: "100%", padding: "14px", borderRadius: 14, border: "none",
              background: "#fff", color: sharing ? "var(--pink-600)" : "var(--brand-700)",
              fontWeight: 800, fontSize: 15, cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? "…" : sharing ? "Stop sharing" : "Start sharing"}
          </button>
        </div>

        {/* Contacts summary → manage */}
        <button
          className="card row gap-12"
          onClick={() => nav("/safety/contacts")}
          style={{ alignItems: "center", padding: 14, textAlign: "left", width: "100%", cursor: "pointer" }}
        >
          <div style={{
            width: 40, height: 40, borderRadius: 12, background: "var(--brand-50)",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <Users size={20} color="var(--brand-600)" />
          </div>
          <div className="grow">
            <div className="semi">Emergency contacts</div>
            <div className="tiny muted">
              {loading ? "Loading…" : list.length === 0 ? "None yet — add someone you trust" : `${list.length} contact${list.length > 1 ? "s" : ""}`}
            </div>
          </div>
          <ChevronRight size={18} color="var(--ink-400)" />
        </button>

        {/* Avatar row preview */}
        {loading ? (
          <ListSkeleton />
        ) : list.length > 0 && (
          <div className="row gap-8" style={{ flexWrap: "wrap" }}>
            {list.map((c) => (
              <div key={c.id} className="col center" style={{ gap: 4, width: 64 }}>
                <SafeImg src={c.avatar} variant="avatar" style={{ width: 44, height: 44 }} />
                <span className="tiny muted" style={{ textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 60 }}>{c.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
