import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppBar, EmptyState, SafeImg } from "@/components/common";
import { ListSkeleton } from "@/components/states";
import { useQuery } from "@/hooks/useApi";
import { useApp } from "@/store";
import { emergencyService, type ContactUser } from "@/services/engagement/emergencyService";
import { UserPlus, X } from "@/components/Icons";

/**
 * Manage the people who receive your live location when you share it. Contacts
 * are STRYT users you've already chatted with (delivery is via chat).
 */
export default function EmergencyContacts() {
  const nav = useNavigate();
  const { showToast } = useApp();
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: contacts, loading, refetch } = useQuery<ContactUser[]>(
    () => emergencyService.listContacts(), []
  );
  const { data: candidates, loading: candLoading } = useQuery<ContactUser[]>(
    () => (adding ? emergencyService.candidateContacts() : Promise.resolve([])), [adding]
  );

  async function add(id: string) {
    setBusyId(id);
    try {
      await emergencyService.addContact(id);
      showToast("Emergency contact added");
      await refetch();
      setAdding(false);
    } catch {
      showToast("Couldn't add contact");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    setBusyId(id);
    try {
      await emergencyService.removeContact(id);
      await refetch();
    } catch {
      showToast("Couldn't remove contact");
    } finally {
      setBusyId(null);
    }
  }

  const list = contacts ?? [];
  const cands = candidates ?? [];

  return (
    <div className="screen">
      <AppBar title="Emergency contacts" onBack={() => nav(-1)} />

      <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
        <p className="tiny muted" style={{ lineHeight: 1.5 }}>
          These people can follow your live location on a map — inside your chat with them —
          whenever you choose to share it. Only people you've chatted with can be added.
        </p>

        {loading ? (
          <ListSkeleton />
        ) : list.length === 0 && !adding ? (
          <EmptyState
            emoji="🛡️"
            title="No emergency contacts yet"
            text="Add someone you trust so you can share your live location with them in one tap."
            action={<button className="btn" onClick={() => setAdding(true)}>Add a contact</button>}
          />
        ) : (
          <>
            {list.map((c) => (
              <div key={c.id} className="card row gap-12" style={{ alignItems: "center", padding: 12 }}>
                <SafeImg src={c.avatar} variant="avatar" style={{ width: 40, height: 40 }} />
                <span className="grow semi">{c.name}</span>
                <button
                  className="btn btn-outline btn-sm"
                  disabled={busyId === c.id}
                  onClick={() => void remove(c.id)}
                  style={{ color: "var(--red-600)", borderColor: "var(--red-200)" }}
                >
                  Remove
                </button>
              </div>
            ))}

            {!adding && (
              <button className="btn btn-outline btn-block" onClick={() => setAdding(true)}>
                <UserPlus size={16} /> Add a contact
              </button>
            )}
          </>
        )}

        {adding && (
          <div className="card" style={{ padding: 12 }}>
            <div className="row" style={{ alignItems: "center", marginBottom: 8 }}>
              <span className="semi grow">Add from your chats</span>
              <button className="btn-icon" onClick={() => setAdding(false)} aria-label="Close"><X size={18} /></button>
            </div>
            {candLoading ? (
              <ListSkeleton />
            ) : cands.length === 0 ? (
              <p className="tiny muted" style={{ padding: "8px 2px" }}>
                No one to add yet — start a chat with someone first, then add them here.
              </p>
            ) : (
              <div className="col gap-8">
                {cands.map((c) => (
                  <div key={c.id} className="row gap-12" style={{ alignItems: "center", padding: "6px 2px" }}>
                    <SafeImg src={c.avatar} variant="avatar" style={{ width: 36, height: 36 }} />
                    <span className="grow">{c.name}</span>
                    <button className="btn btn-sm" disabled={busyId === c.id} onClick={() => void add(c.id)}>
                      {busyId === c.id ? "…" : "Add"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
