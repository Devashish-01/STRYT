import { useState } from "react";
import { Check, Plus, ListPlus } from "lucide-react";
import { useApp } from "@/store";
import type { BookmarkTarget } from "@/types";

const emojis = ["🌟", "🍽️", "🚨", "🧸", "💎", "🎁", "🏠", "💇", "🛍️", "❤️"];

export default function AddToListSheet({
  type,
  id,
  onClose,
}: {
  type: BookmarkTarget;
  id: string;
  onClose: () => void;
}) {
  const { lists, addToList, createList } = useApp();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🌟");

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <div className="row gap-8" style={{ marginBottom: 14 }}>
          <ListPlus size={20} color="var(--brand-700)" />
          <h3 className="bold" style={{ fontSize: 18 }}>Save to a list</h3>
        </div>

        <div className="col gap-8">
          {lists.map((l) => {
            const has = l.items.some((it) => it.type === type && it.id === id);
            return (
              <button
                key={l.id}
                className="card row gap-12"
                style={{ padding: 13, textAlign: "left", border: has ? "1.5px solid var(--brand-400)" : "1px solid var(--line)" }}
                onClick={() => { if (!has) addToList(l.id, type, id); onClose(); }}
              >
                <span style={{ fontSize: 24 }}>{l.emoji}</span>
                <div className="grow">
                  <div className="semi small">{l.name}</div>
                  <div className="tiny muted">{l.items.length} saved {l.shared && "• shared"}</div>
                </div>
                {has ? <Check size={20} color="#16a34a" /> : <Plus size={20} color="var(--ink-400)" />}
              </button>
            );
          })}
        </div>

        {!creating ? (
          <button className="btn btn-ghost btn-block" style={{ marginTop: 12 }} onClick={() => setCreating(true)}>
            <Plus size={18} /> New list
          </button>
        ) : (
          <div className="card" style={{ padding: 14, marginTop: 12 }}>
            <div className="row gap-8" style={{ overflowX: "auto", marginBottom: 10 }}>
              {emojis.map((e) => (
                <button key={e} onClick={() => setEmoji(e)} style={{ fontSize: 22, opacity: emoji === e ? 1 : 0.4, transform: emoji === e ? "scale(1.2)" : "scale(1)" }}>{e}</button>
              ))}
            </div>
            <input className="input" placeholder="List name (e.g. Weekend plans)" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            <button
              className="btn btn-primary btn-block"
              style={{ marginTop: 10 }}
              disabled={name.trim().length < 2}
              onClick={async () => {
                const lid = await createList(name.trim(), emoji);
                addToList(lid, type, id);
                onClose();
              }}
            >
              Create & save
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
