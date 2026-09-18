import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppBar, EmptyState, SafeImg } from "@/components/common";
import { ListSkeleton } from "@/components/states";
import { useQueryWithRealtime } from "@/hooks/useApi";
import { useApp } from "@/store";
import { emergencyService, type ContactUser } from "@/services/engagement/emergencyService";
import { UserPlus, X, Search } from "@/components/Icons";
import { errorMessage } from "@/lib/errorMessage";

/**
 * Manage the people who receive your live location when you share it. Contacts
 * are STRYT users you've already chatted with (delivery is via chat).
 */
export default function EmergencyContacts() {
  const nav = useNavigate();
  const { showToast, user } = useApp();
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<ContactUser | null>(null);

  const { data: contacts, loading, refetch } = useQueryWithRealtime<ContactUser[]>(
    () => emergencyService.listContacts(),
    "emergency_contacts",
    [user.id],
    user.id ? `owner_user_id=eq.${user.id}` : undefined,
    `safety:contacts:${user.id}`,
  );
  const { data: candidates, loading: candLoading } = useQueryWithRealtime<ContactUser[]>(
    () => (adding ? emergencyService.candidateContacts(search) : Promise.resolve([])),
    "emergency_contacts",
    [adding, search],
    user.id ? `owner_user_id=eq.${user.id}` : undefined,
  );
  const [identifier, setIdentifier] = useState("");
  const [addingByIdentifier, setAddingByIdentifier] = useState(false);

  /** ECON-1: the people you'd actually list in an emergency usually aren't people you've chatted with in the app. */
  async function addByIdentifier() {
    if (!identifier.trim() || addingByIdentifier) return;
    setAddingByIdentifier(true);
    try {
      const added = await emergencyService.addByIdentifier(identifier);
      showToast(`${added.name} added as an emergency contact`);
      setIdentifier("");
      await refetch();
      setAdding(false);
    } catch (err) {
      showToast(errorMessage(err, "Couldn't add contact"));
    } finally {
      setAddingByIdentifier(false);
    }
  }

  async function add(id: string) {
    setBusyId(id);
    try {
      await emergencyService.addContact(id);
      showToast("Emergency contact added");
      await refetch();
      setAdding(false);
      setSearch("");
    } catch (err) {
      showToast(errorMessage(err, "Couldn't add contact"));
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    setBusyId(id);
    try {
      await emergencyService.removeContact(id);
      showToast("Emergency contact removed");
      await refetch();
    } catch (err) {
      showToast(errorMessage(err, "Couldn't remove contact"));
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
                  onClick={() => setConfirmRemove(c)}
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
              <span className="semi grow">Add an emergency contact</span>
              <button className="btn-icon" onClick={() => { setAdding(false); setSearch(""); }} aria-label="Close"><X size={18} /></button>
            </div>

            {/* By identifier first: family and neighbours are rarely people you've messaged in the app (ECON-1). */}
            <div className="col gap-8" style={{ marginBottom: 12 }}>
              <label className="tiny semi muted" htmlFor="emergency-identifier">Their mobile number, email or username</label>
              <div className="row gap-8">
                <input
                  id="emergency-identifier"
                  className="input grow"
                  placeholder="e.g. 98765 43210"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void addByIdentifier(); }}
                  style={{ height: 40, fontSize: 13 }}
                />
                <button
                  className="btn btn-primary"
                  style={{ minHeight: 44, padding: "0 16px" }}
                  disabled={!identifier.trim() || addingByIdentifier}
                  onClick={() => void addByIdentifier()}
                >
                  {addingByIdentifier ? "Adding…" : "Add"}
                </button>
              </div>
              <span className="tiny muted">They must already be on STRYT. Up to 10 contacts.</span>
            </div>

            <div className="tiny semi muted" style={{ marginBottom: 6 }}>Or pick someone you've chatted with</div>
            <div style={{ position: "relative", marginBottom: 10 }}>
              <Search size={15} color="var(--ink-400)" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
              <input
                type="search"
                className="input"
                aria-label="Search chats by name"
                placeholder="Search chats by name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ paddingLeft: 32, height: 36, fontSize: 13 }}
              />
            </div>

            {candLoading ? (
              <ListSkeleton />
            ) : cands.length === 0 ? (
              <p className="tiny muted" style={{ padding: "8px 2px" }}>
                {search.trim() ? "No matching contacts found." : "No one to add yet — start a chat with someone first, then add them here."}
              </p>
            ) : (
              <div className="col gap-8">
                {cands.map((c) => (
                  <div key={c.id} className="row gap-12" style={{ alignItems: "center", padding: "6px 2px" }}>
                    <SafeImg src={c.avatar} variant="avatar" style={{ width: 36, height: 36 }} />
                    <span className="grow">{c.name}</span>
                    <button
                      className="btn btn-sm"
                      style={{ minHeight: 44, minWidth: 64 }}
                      aria-label={`Add ${c.name} as an emergency contact`}
                      disabled={busyId === c.id}
                      onClick={() => void add(c.id)}
                    >
                      {busyId === c.id ? "…" : "Add"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {confirmRemove && (
        <div className="overlay" onClick={() => setConfirmRemove(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-grab" />
            <h3 className="bold h2" style={{ marginBottom: 6 }}>Remove emergency contact?</h3>
            <p className="small muted" style={{ marginBottom: 16, lineHeight: 1.5 }}>
              <strong>{confirmRemove.name}</strong> will no longer be able to track your live location when shared.
            </p>
            <div className="col gap-8">
              <button
                className="btn btn-block"
                style={{ background: "var(--red-500)", color: "var(--white)" }}
                disabled={busyId === confirmRemove.id}
                onClick={() => {
                  const target = confirmRemove;
                  setConfirmRemove(null);
                  void remove(target.id);
                }}
              >
                {busyId === confirmRemove.id ? "Removing…" : "Yes, remove contact"}
              </button>
              <button className="btn btn-ghost btn-block" onClick={() => setConfirmRemove(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
