import { useState } from "react";
import { useParams } from "react-router-dom";
import { AppBar, EmptyState } from "@/components/common";
import { Plus, Tag, Trash2, Megaphone } from "@/components/Icons";
import { businessService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { ListSkeleton, ErrorView } from "@/components/states";
import { useApp } from "@/store";

export default function OffersManager() {
  const { id = "" } = useParams();
  const { showToast } = useApp();
  const { data: b, loading, refetch } = useQuery(() => businessService.get(id), [id]);

  if (!id) {
    return (
      <div className="screen">
        <AppBar title="Offers" />
        <ErrorView error={{ code: "BAD_REQUEST", message: "Missing target ID parameter." } as any} />
      </div>
    );
  }
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [code, setCode] = useState("");
  const [until, setUntil] = useState("");
  const [saving, setSaving] = useState(false);

  if (loading) return <div className="screen"><AppBar title="Offers" /><ListSkeleton count={2} /></div>;
  if (!b) return null;

  async function add() {
    setSaving(true);
    try {
      await businessService.addOffer(id, {
        title,
        description: desc,
        code: code || undefined,
        validUntil: until || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      });
      showToast("Offer created");
      setCreating(false);
      setTitle(""); setDesc(""); setCode(""); setUntil("");
      refetch();
    } catch {
      showToast("Couldn't create offer. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(offerId: string) {
    try {
      await businessService.deleteOffer(id, offerId);
      showToast("Offer removed");
      refetch();
    } catch {
      showToast("Couldn't remove. Try again.");
    }
  }

  return (
    <div className="screen">
      <AppBar title="Offers" right={<button className="icon-btn" onClick={() => setCreating(true)}><Plus size={20} /></button>} />
      <div className="screen-scroll page-pad col gap-12" style={{ paddingBottom: 30 }}>
        {b.offers.length === 0 && !creating && (
          <EmptyState
            emoji="🏷️"
            title="No offers yet"
            text="Create an offer to pull in nearby customers."
            action={<button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>Create offer</button>}
          />
        )}

        {creating && (
          <div className="card">
            <div className="field"><label>Title</label><input className="input" placeholder="e.g. 50% OFF up to ₹100" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
            <div className="field" style={{ marginTop: 10 }}><label>Description</label><input className="input" value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
            <div className="row gap-10" style={{ marginTop: 10 }}>
              <div className="field grow"><label>Code</label><input className="input" placeholder="NAYA50" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} /></div>
              <div className="field grow"><label>Valid until</label><input className="input" placeholder="30 Jun" value={until} onChange={(e) => setUntil(e.target.value)} /></div>
            </div>
            <div className="row gap-8" style={{ marginTop: 12 }}>
              <button className="btn btn-ghost grow btn-sm" onClick={() => setCreating(false)}>Cancel</button>
              <button className="btn btn-primary grow btn-sm" disabled={title.trim().length < 3 || saving} onClick={add}>
                {saving ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        )}

        {b.offers.map((o) => (
          <div key={o.id} className="card row gap-12" style={{ padding: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--orange-100)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Tag size={18} color="var(--orange-500)" />
            </div>
            <div className="grow">
              <div className="semi small">{o.title}</div>
              <div className="tiny muted">{o.description}</div>
              <div className="row gap-8" style={{ marginTop: 6 }}>
                {o.code && <span className="badge badge-amber">{o.code}</span>}
                <span className="tiny muted">till {o.validUntil}</span>
              </div>
            </div>
            <div className="col gap-8">
              <button
                className="icon-btn"
                style={{ width: 32, height: 32 }}
                onClick={async () => {
                  try {
                    await businessService.buyBoost(id, "OFFER_PROMOTION");
                    showToast("Promoted to nearby users");
                  } catch {
                    showToast("Failed to promote offer. Try again.");
                  }
                }}
              >
                <Megaphone size={15} color="var(--brand-700)" />
              </button>
              <button className="icon-btn" style={{ width: 32, height: 32, color: "var(--red-600)" }} onClick={() => remove(o.id)}>
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
