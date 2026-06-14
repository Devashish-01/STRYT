import { useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { AppBar, VegDot, inr } from "@/components/common";
import { Plus, Pencil, Trash2, Camera, Star } from "lucide-react";
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
    showToast(next === "OUT_OF_STOCK" ? "Marked out of stock" : "Back in stock");
    refetch();
  }

  return (
    <div className="screen">
      <AppBar
        title="Catalog"
        subtitle={`${b.catalog.length} items`}
        right={<button className="icon-btn" onClick={() => setCreating(true)}><Plus size={20} /></button>}
      />
      <div className="screen-scroll page-pad col gap-12" style={{ paddingBottom: 30 }}>
        {b.catalog.map((item) => (
          <div key={item.id} className="card row gap-12" style={{ padding: 12 }}>
            <img src={item.image} className="thumb" style={{ width: 64, height: 64, borderRadius: 12, objectFit: "cover" }} />
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="row gap-6">
                {item.isVeg != null && <VegDot veg={item.isVeg} />}
                <span className="semi small ellipsis">{item.name}</span>
                {item.bestSeller && <Star size={13} fill="#f59e0b" strokeWidth={0} />}
              </div>
              <div className="row gap-6" style={{ marginTop: 2 }}>
                <span className="bold small">{inr(item.salePrice ?? item.price)}</span>
                {item.salePrice && <span className="tiny muted" style={{ textDecoration: "line-through" }}>{inr(item.price)}</span>}
              </div>
              <button
                className="tiny semi"
                style={{ color: item.stockStatus === "OUT_OF_STOCK" ? "#dc2626" : "#16a34a", marginTop: 4 }}
                onClick={() => toggleStock(item)}
              >
                {item.stockStatus === "OUT_OF_STOCK" ? "○ Out of stock — tap to restock" : "● In stock"}
              </button>
            </div>
            <div className="col gap-8">
              <button className="icon-btn" style={{ width: 34, height: 34 }} onClick={() => setEditing(item)}><Pencil size={15} /></button>
              <button className="icon-btn" style={{ width: 34, height: 34, color: "#dc2626" }} onClick={() => remove(item)}><Trash2 size={15} /></button>
            </div>
          </div>
        ))}
        {b.catalog.length === 0 && (
          <p className="muted small center" style={{ padding: 30 }}>No items yet. Tap + to add your first.</p>
        )}
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
  const [veg, setVeg] = useState(item?.isVeg ?? true);
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
      const payload = {
        name,
        description: desc,
        price: Number(price),
        salePrice: sale ? Number(sale) : undefined,
        image: image || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=300&q=70",
        isVeg: veg,
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
        <h3 className="bold" style={{ fontSize: 18, marginBottom: 14 }}>{item ? "Edit item" : "Add item"}</h3>

        {/* Photo picker — real file input */}
        <label style={{ display: "block", width: "100%", height: 120, borderRadius: 14, border: "2px dashed var(--ink-300)", overflow: "hidden", marginBottom: 14, cursor: "pointer" }}>
          {image
            ? <img src={image} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <span className="col center muted gap-4" style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Camera size={26} /><span className="tiny">{uploading ? "Uploading…" : "Add photo"}</span>
              </span>
          }
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={pickImage} disabled={uploading} />
        </label>

        <div className="col gap-12">
          <div className="field"><label>Name *</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Paneer Tikka" /></div>
          <div className="field"><label>Description</label><input className="input" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Short description" /></div>
          <div className="row gap-10">
            <div className="field grow"><label>Price ₹ *</label><input className="input" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))} /></div>
            <div className="field grow"><label>Sale price ₹</label><input className="input" inputMode="numeric" value={sale} onChange={(e) => setSale(e.target.value.replace(/\D/g, ""))} /></div>
          </div>
          <div className="row gap-10">
            <button className={`chip grow center ${veg ? "active" : ""}`} onClick={() => setVeg(true)}>🟢 Veg</button>
            <button className={`chip grow center ${!veg ? "active" : ""}`} onClick={() => setVeg(false)}>🔴 Non-veg</button>
          </div>
          <button className={`chip ${best ? "active" : ""}`} onClick={() => setBest((v) => !v)} style={{ justifyContent: "center" }}>
            ⭐ Mark as bestseller
          </button>
        </div>

        <button className="btn btn-primary btn-block" style={{ marginTop: 16 }} disabled={!canSave || saving || uploading} onClick={save}>
          {saving ? "Saving…" : item ? "Save changes" : "Add item"}
        </button>
      </div>
    </div>
  );
}
