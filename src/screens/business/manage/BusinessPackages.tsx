import { useState } from "react";
import { useParams } from "react-router-dom";
import { AppBar, inr, EmptyState } from "@/components/common";
import { businessService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { ListSkeleton, ErrorView } from "@/components/states";
import { Plus, Zap, Trash2 } from "lucide-react";
import { useApp } from "@/store";
import type { BusinessPackage } from "@/types";
import ManageNav from "./ManageNav";

export default function BusinessPackages() {
  const { id = "" } = useParams();
  const { data, loading, refetch } = useQuery<BusinessPackage[]>(() => businessService.packages(id), [id]);

  if (!id) {
    return (
      <div className="screen">
        <AppBar title="Service Packages" />
        <ErrorView error={{ code: "BAD_REQUEST", message: "Missing target ID parameter." } as any} />
      </div>
    );
  }
  const { showToast } = useApp();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [price, setPrice] = useState("");
  const [duration, setDuration] = useState("");
  const [instant, setInstant] = useState(false);
  const [saving, setSaving] = useState(false);

  return (
    <div className="screen with-nav">
      <AppBar
        title="Service Packages"
        subtitle="Fixed-price offers shown to customers"
        right={<button className="icon-btn" onClick={() => setCreating(true)}><Plus size={20} /></button>}
      />
      <div className="screen-scroll">
        {loading && <ListSkeleton count={3} />}
        {data && (
          <div className="page-pad col gap-12">
            {creating && (
              <div className="card" style={{ padding: 14 }}>
                <div className="field"><label>Package name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Full Body Checkup" /></div>
                <div className="field" style={{ marginTop: 10 }}><label>What's included</label><input className="input" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="e.g. Consultation + report" /></div>
                <div className="row gap-10" style={{ marginTop: 10 }}>
                  <div className="field grow"><label>Price ₹</label><input className="input" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))} /></div>
                  <div className="field grow"><label>Duration (optional)</label><input className="input" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="e.g. 45 min" /></div>
                </div>
                <button className={`chip ${instant ? "active" : ""}`} style={{ marginTop: 10, justifyContent: "center" }} onClick={() => setInstant((v) => !v)}>
                  <Zap size={13} /> Instant book (no negotiation)
                </button>
                <div className="row gap-8" style={{ marginTop: 12 }}>
                  <button className="btn btn-ghost grow btn-sm" onClick={() => { setCreating(false); setName(""); setDesc(""); setPrice(""); setDuration(""); setInstant(false); }}>Cancel</button>
                  <button
                    className="btn btn-green grow btn-sm"
                    disabled={!name || !price || saving}
                    onClick={async () => {
                      setSaving(true);
                      try {
                        await businessService.addPackage(id, { name, desc, price: Number(price), duration: duration || undefined, instantBook: instant });
                        showToast("Package added");
                        setCreating(false); setName(""); setDesc(""); setPrice(""); setDuration(""); setInstant(false);
                        refetch();
                      } catch { showToast("Couldn't add package. Try again."); }
                      finally { setSaving(false); }
                    }}
                  >{saving ? "Adding…" : "Add"}</button>
                </div>
              </div>
            )}

            {data.length === 0 && !creating && (
              <EmptyState
                emoji="📦"
                title="No packages yet"
                text="Add fixed-price service packages — customers can pick one when booking an appointment."
                action={<button className="btn btn-green btn-sm" onClick={() => setCreating(true)}>Add first package</button>}
              />
            )}

            {data.map((pk) => (
              <div key={pk.id} className="card row gap-12" style={{ padding: 14 }}>
                <div className="grow">
                  <div className="row gap-6">
                    <span className="semi small">{pk.name}</span>
                    {pk.instantBook && <span className="badge badge-green"><Zap size={10} /> Instant</span>}
                  </div>
                  <div className="tiny muted" style={{ marginTop: 2 }}>
                    {pk.desc}{pk.duration ? ` • ${pk.duration}` : ""}
                  </div>
                  <div className="bold small" style={{ color: "var(--green-600)", marginTop: 4 }}>{inr(pk.price)}</div>
                </div>
                <button
                  className="icon-btn"
                  style={{ width: 32, height: 32, color: "var(--red-600)" }}
                  onClick={async () => { await businessService.deletePackage(id, pk.id); showToast("Package removed"); refetch(); }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <ManageNav bizId={id} />
    </div>
  );
}
