import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppBar, EmptyState, SafeImg } from "@/components/common";
import { Plus, Share2, ChevronRight, Users } from "@/components/Icons";
import { useApp } from "@/store";
import { copyText } from "@/lib/clipboard";
import { discoveryService } from "@/services";
import { useQuery } from "@/hooks/useApi";

const emojis = ["🌟", "🍽️", "🚨", "🧸", "💎", "🎁", "🏠", "💇", "🛍️", "❤️"];

export default function Lists() {
  const nav = useNavigate();
  const { lists, createList, showToast, user } = useApp();
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🌟");

  const { data: bizPage } = useQuery(() => discoveryService.businesses({ lat: user.lat || undefined, lng: user.lng || undefined }), [user.lat, user.lng]);
  const { data: provPage } = useQuery(() => discoveryService.providers({ lat: user.lat || undefined, lng: user.lng || undefined }), [user.lat, user.lng]);
  const businesses = bizPage?.data ?? [];
  const providers = provPage?.data ?? [];

  const active = lists.find((l) => l.id === open);

  if (active) {
    return (
      <div className="screen">
        <AppBar
          title={`${active.emoji} ${active.name}`}
          subtitle={`${active.items.length} saved`}
          onBack={() => setOpen(null)}
          right={<button className="icon-btn" onClick={async () => { const ok = await copyText(window.location.href); showToast(ok ? "List link copied" : "Couldn't copy link"); }}><Share2 size={18} /></button>}
        />
        <div className="screen-scroll page-pad col gap-12">
          {active.items.length === 0 ? (
            <EmptyState emoji="📂" title="Empty list" text="Save shops or providers here from their pages." />
          ) : (
            active.items.map((it, i) => {
              const b = it.type === "BUSINESS" ? businesses.find((x) => x.id === it.id) : undefined;
              const p = it.type === "PROVIDER" ? providers.find((x) => x.id === it.id) : undefined;
              const name = b?.name ?? p?.displayName ?? "Item";
              const img = b?.coverImage ?? p?.avatar ?? "";
              const sub = b?.subCategory ?? p?.categoryName ?? "";
              return (
                <button key={it.id} className="card row gap-12" style={{ padding: 12, textAlign: "left" }} onClick={() => nav(it.type === "BUSINESS" ? `/business/${it.id}` : `/provider/${it.id}`)}>
                  <SafeImg src={img} variant={it.type === "PROVIDER" ? "avatar" : "photo"} className="thumb" style={{ width: 56, height: 56, borderRadius: 12 }} />
                  <div className="grow">
                    <div className="semi small">{name}</div>
                    <div className="tiny muted">{sub}</div>
                  </div>
                  <ChevronRight size={18} color="var(--ink-300)" />
                </button>
              );
            })
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <AppBar title="My lists" right={<button className="icon-btn" onClick={() => setCreating(true)}><Plus size={20} /></button>} />
      <div className="screen-scroll page-pad col gap-12">
        {creating && (
          <div className="card">
            <div className="row gap-8" style={{ overflowX: "auto", marginBottom: 10 }}>
              {emojis.map((e) => (
                <button key={e} onClick={() => setEmoji(e)} style={{ fontSize: 22, opacity: emoji === e ? 1 : 0.4, transform: emoji === e ? "scale(1.2)" : "scale(1)" }}>{e}</button>
              ))}
            </div>
            <input className="input" placeholder="List name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            <div className="row gap-8" style={{ marginTop: 10 }}>
              <button className="btn btn-ghost grow btn-sm" onClick={() => { setCreating(false); setName(""); }}>Cancel</button>
              <button className="btn btn-primary grow btn-sm" disabled={name.trim().length < 2} onClick={() => { createList(name.trim(), emoji); setName(""); setCreating(false); }}>Create</button>
            </div>
          </div>
        )}

        {lists.map((l) => (
          <button key={l.id} className="card row gap-12" style={{ padding: 14, textAlign: "left" }} onClick={() => setOpen(l.id)}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: "var(--brand-50)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>{l.emoji}</div>
            <div className="grow">
              <div className="semi">{l.name}</div>
              <div className="tiny muted row gap-6">{l.items.length} saved {l.shared && <span className="row gap-4"><Users size={11} /> shared</span>}</div>
            </div>
            <ChevronRight size={18} color="var(--ink-300)" />
          </button>
        ))}
      </div>
    </div>
  );
}
