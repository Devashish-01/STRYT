import { useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { AppBar, VegDot, inr } from "@/components/common";
import { Plus, Pencil, Trash2, Camera, Star, Tag } from "lucide-react";
import { businessService, uploadService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { ListSkeleton } from "@/components/states";
import { useApp } from "@/store";
import type { CatalogItem } from "@/types";

export default function CatalogManager() {
  const { id = "b1" } = useParams();
  const { showToast } = useApp();
  const { data: b, loading, refetch } = useQuery(() => businessService.get(id), [id]);
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [creating, setCreating] = useState(false);

  if (loading) return <div className="screen"><AppBar title="Catalog" /><ListSkeleton count={3} /></div>;
  if (!b) return null;


  async function remove(item: CatalogItem) {
    await businessService.deleteCatalogItem(id, item.id);
    showToast("Item removed");
    refetch();
  }

  async function toggleStock(item: CatalogItem) {
    const next = item.stockStatus === "OUT_OF_STOCK" ? "IN_STOCK" : "OUT_OF_STOCK";
    await businessService.updateCatalogItem(id, item.id, { stockStatus: next });
    showToast(next === "OUT_OF_STOCK" ? "Marked as unavailable" : "Marked as available");
    refetch();
  }

  return (
    <div className="screen">
      <AppBar
        title="Catalog"
        subtitle={b.catalog.length > 0 ? `${b.catalog.length} listing${b.catalog.length === 1 ? "" : "s"}` : "Products, services & items"}
        right={b.catalog.length > 0 ? <button className="icon-btn" onClick={() => setCreating(true)}><Plus size={20} /></button> : undefined}
      />
      <div className="screen-scroll page-pad col gap-12" style={{ paddingBottom: 30 }}>
        {b.catalog.length === 0 && (
          <div className="col center" style={{ padding: "48px 20px", gap: 12 }}>
            <Tag size={36} color="var(--ink-300)" />
            <div className="semi small" style={{ color: "var(--ink-500)" }}>No listings yet</div>
            <p className="tiny muted center" style={{ maxWidth: 240, lineHeight: 1.5 }}>
              Add your products, services, or menu items. Customers see these on your public page.
            </p>
            <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>Add first listing</button>
          </div>
        )}
        {b.catalog.map((item) => (
          <div key={item.id} className="card row gap-12" style={{ padding: 12 }}>
            {item.image
              ? <img src={item.image} className="thumb" style={{ width: 64, height: 64, borderRadius: 12, objectFit: "cover", flexShrink: 0 }} />
              : <div style={{ width: 64, height: 64, borderRadius: 12, background: "var(--ink-100)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}><Tag size={24} color="var(--ink-400)" /></div>
            }
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="row gap-6">
                {item.isVeg != null && <VegDot veg={item.isVeg} />}
                <span className="semi small ellipsis">{item.name}</span>
                {item.bestSeller && <Star size={13} fill="#f59e0b" strokeWidth={0} />}
              </div>
              {item.description && <div className="tiny muted ellipsis" style={{ marginTop: 1 }}>{item.description}</div>}
              <div className="row gap-6" style={{ marginTop: 4 }}>
                <span className="bold small">{inr(item.salePrice ?? item.price)}</span>
                {item.salePrice && <span className="tiny muted" style={{ textDecoration: "line-through" }}>{inr(item.price)}</span>}
              </div>
              <button
                className="tiny semi"
                style={{ color: item.stockStatus === "OUT_OF_STOCK" ? "#dc2626" : "#16a34a", marginTop: 4 }}
                onClick={() => toggleStock(item)}
              >
                {item.stockStatus === "OUT_OF_STOCK" ? "○ Unavailable — tap to mark available" : "● Available"}
              </button>
            </div>
            <div className="col gap-8">
              <button className="icon-btn" style={{ width: 34, height: 34 }} onClick={() => setEditing(item)}><Pencil size={15} /></button>
              <button className="icon-btn" style={{ width: 34, height: 34, color: "#dc2626" }} onClick={() => remove(item)}><Trash2 size={15} /></button>
            </div>
          </div>
        ))}
      </div>

      {(creating || editing) && (
        <ItemEditor
          bizId={id}
          item={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); refetch(); }}
        />
      )}
    </div>
  );
}

function ItemEditor({
  bizId, item, onClose, onSaved,
}: {
  bizId: string;
  item: CatalogItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { showToast } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(item?.name ?? "");
  const [desc, setDesc] = useState(item?.description ?? "");
  const [price, setPrice] = useState(item?.price?.toString() ?? "");
  const [sale, setSale] = useState(item?.salePrice?.toString() ?? "");
  const [image, setImage] = useState(item?.image ?? "");
  const [best, setBest] = useState(item?.bestSeller ?? false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const canSave = name.trim().length > 1 && !!price;

  async function pickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadService.upload(file, "catalog");
      setImage(url);
    } catch {
      showToast("Upload failed. Try again.");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const payload: Partial<CatalogItem> = {
        name,
        description: desc,
        price: Number(price),
        salePrice: sale ? Number(sale) : undefined,
        image: image || undefined,
        bestSeller: best,
      };
      if (item) await businessService.updateCatalogItem(bizId, item.id, payload);
      else await businessService.addCatalogItem(bizId, payload);
      showToast(item ? "Item updated" : "Item added");
      onSaved();
    } catch {
      showToast("Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <h3 className="bold" style={{ fontSize: 18, marginBottom: 14 }}>{item ? "Edit listing" : "New listing"}</h3>

        {/* Photo picker */}
        <label style={{ display: "block", width: "100%", height: 120, borderRadius: 14, border: "2px dashed var(--ink-300)", overflow: "hidden", marginBottom: 14, cursor: "pointer", background: "var(--ink-50)" }}>
          {image
            ? <img src={image} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <span style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, color: "var(--ink-400)" }}>
                <Camera size={26} /><span className="tiny">{uploading ? "Uploading…" : "Add photo (optional)"}</span>
              </span>
          }
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={pickImage} disabled={uploading} />
        </label>

        <div className="col gap-12">
          <div className="field">
            <label>Name *</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Classic Haircut, Phone Case, Sofa Repair" />
          </div>
          <div className="field">
            <label>Description</label>
            <input className="input" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Brief description, size, variant…" />
          </div>
          <div className="row gap-10">
            <div className="field grow"><label>Price ₹ *</label><input className="input" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))} /></div>
            <div className="field grow"><label>Offer price ₹</label><input className="input" inputMode="numeric" value={sale} onChange={(e) => setSale(e.target.value.replace(/\D/g, ""))} placeholder="Optional" /></div>
          </div>
          <button className={`chip ${best ? "active" : ""}`} onClick={() => setBest((v) => !v)} style={{ justifyContent: "center" }}>
            ⭐ Mark as featured
          </button>
        </div>

        <button className="btn btn-primary btn-block" style={{ marginTop: 16 }} disabled={!canSave || saving || uploading} onClick={save}>
          {saving ? "Saving…" : item ? "Save changes" : "Add listing"}
        </button>
      </div>
    </div>
  );
}
