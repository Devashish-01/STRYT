import { useState } from "react";
import { useParams } from "react-router-dom";
import { AppBar, inr, EmptyState } from "@/components/common";
import { providerService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { ListSkeleton } from "@/components/states";
import { Plus, Zap, Trash2 } from "lucide-react";
import { useApp } from "@/store";
import type { ProviderPackage } from "@/types";

export default function ProviderPackages() {
  const { id = "p1" } = useParams();
  const { data, loading, refetch } = useQuery<ProviderPackage[]>(() => providerService.packages(id) as any, [id]);
  const { showToast } = useApp();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [price, setPrice] = useState("");
  const [instant, setInstant] = useState(false);
  const [saving, setSaving] = useState(false);

  return (
    <div className="screen">
      <AppBar title="Service packages" subtitle="Fixed-price offers" right={<button className="icon-btn" onClick={() => setCreating(true)}><Plus size={20} /></button>} />
      <div className="screen-scroll">
        {loading && <ListSkeleton count={3} />}
        {data && (
          <div className="page-pad col gap-12">
            {creating && (
              <div className="card" style={{ padding: 14 }}>
                <div className="field"><label>Package name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bathroom fitting" /></div>
                <div className="field" style={{ marginTop: 10 }}><label>What's included</label><input className="input" value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
                <div className="field" style={{ marginTop: 10 }}><label>Price ₹</label><input className="input" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))} /></div>
                <button className={`chip ${instant ? "active" : ""}`} style={{ marginTop: 10, justifyContent: "center" }} onClick={() => setInstant((v) => !v)}><Zap size={13} /> Instant book (no negotiation)</button>
                <div className="row gap-8" style={{ marginTop: 12 }}>
                  <button className="btn btn-ghost grow btn-sm" onClick={() => setCreating(false)}>Cancel</button>
                  <button
                    className="btn btn-green grow btn-sm"
                    disabled={!name || !price || saving}
                    onClick={async () => {
                      setSaving(true);
                      try {
                        await providerService.addPackage(id, { name, desc, price: Number(price), instantBook: instant });
                        showToast("Package added");
                        setCreating(false); setName(""); setDesc(""); setPrice(""); setInstant(false);
                        refetch();
                      } catch { showToast("Couldn't add package. Try again."); }
                      finally { setSaving(false); }
                    }}
                  >{saving ? "Adding…" : "Add"}</button>
                </div>
              </div>
            )}

            {data.length === 0 && !creating && <EmptyState emoji="📦" title="No packages yet" text="Fixed-price packages win more instant bookings." action={<button className="btn btn-green btn-sm" onClick={() => setCreating(true)}>Add package</button>} />}

            {data.map((pk) => (
              <div key={pk.id} className="card row gap-12" style={{ padding: 14 }}>
                <div className="grow">
                  <div className="row gap-6"><span className="semi small">{pk.name}</span>{pk.instantBook && <span className="badge badge-green"><Zap size={10} /> Instant</span>}</div>
                  <div className="tiny muted">{pk.desc} • {pk.duration}</div>
                  <div className="bold small" style={{ color: "var(--green-600)", marginTop: 4 }}>{inr(pk.price)}</div>
                </div>
                <button className="icon-btn" style={{ width: 32, height: 32, color: "#dc2626" }} onClick={async () => { await providerService.deletePackage(id, pk.id); showToast("Package removed"); refetch(); }}><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
