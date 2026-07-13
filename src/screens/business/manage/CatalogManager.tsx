import { useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { AppBar, VegDot, inr } from "@/components/common";
import { Plus, Pencil, Trash2, Camera, Star, Tag } from "@/components/Icons";
import { businessService, providerService, uploadService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { ListSkeleton, ErrorView } from "@/components/states";
import { useApp } from "@/store";
import type { CatalogItem } from "@/types";

type Kind = "business" | "provider";

function serviceFor(kind: Kind) {
  return kind === "business" ? businessService : providerService;
}

export function CatalogManager({ kind }: { kind: Kind }) {
  const { id = "" } = useParams();
  const { showToast } = useApp();
  const service = serviceFor(kind);
  const { data: entity, loading, refetch } = useQuery<{ catalog: CatalogItem[] } | undefined>(
    () => (kind === "business" ? businessService.get(id) : providerService.get(id)),
    [id]
  );

  if (!id) {
    return (
      <div className="screen">
        <AppBar title="Catalog" />
        <ErrorView error={{ code: "BAD_REQUEST", message: "Missing target ID parameter." } as any} />
      </div>
    );
  }
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [creating, setCreating] = useState(false);

  if (loading) return <div className="screen"><AppBar title="Catalog" /><ListSkeleton count={3} /></div>;
  if (!entity) return null;
  const catalog: CatalogItem[] = entity.catalog ?? [];

  async function remove(item: CatalogItem) {
    await service.deleteCatalogItem(id, item.id);
    showToast("Item removed");
    refetch();
  }

  async function toggleStock(item: CatalogItem) {
    const next = item.stockStatus === "OUT_OF_STOCK" ? "IN_STOCK" : "OUT_OF_STOCK";
    await service.updateCatalogItem(id, item.id, { stockStatus: next });
    showToast(next === "OUT_OF_STOCK" ? "Marked as unavailable" : "Marked as available");
    refetch();
  }

  return (
    <div className="screen">
      <AppBar
        title="Catalog"
        subtitle={catalog.length > 0 ? `${catalog.length} listing${catalog.length === 1 ? "" : "s"}` : "Products, services & items"}
        right={catalog.length > 0 ? <button className="icon-btn" onClick={() => setCreating(true)}><Plus size={20} /></button> : undefined}
      />
      <div className="screen-scroll page-pad col gap-12" style={{ paddingBottom: 30 }}>
        {catalog.length === 0 && (
          <div className="col center" style={{ padding: "48px 20px", gap: 12 }}>
            <Tag size={36} color="var(--ink-300)" />
            <div className="semi small" style={{ color: "var(--ink-500)" }}>No listings yet</div>
            <p className="tiny muted center" style={{ maxWidth: 240, lineHeight: 1.5 }}>
              Add your products, services, or menu items. Customers see these on your public page.
            </p>
            <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>Add first listing</button>
          </div>
        )}
        {catalog.map((item) => (
          <div key={item.id} className="card row gap-12" style={{ padding: 12 }}>
            {item.image
              ? <img src={item.image} className="thumb" style={{ width: 64, height: 64, borderRadius: 12, objectFit: "cover", flexShrink: 0 }} />
              : <div style={{ width: 64, height: 64, borderRadius: 12, background: "var(--ink-100)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}><Tag size={24} color="var(--ink-400)" /></div>
            }
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="row gap-6">
                {item.isFood && item.isVeg != null && <VegDot veg={item.isVeg} />}
                <span className="semi small ellipsis">{item.name}</span>
                {item.bestSeller && <Star size={13} fill="var(--amber-500)" strokeWidth={0} />}
              </div>
              {item.description && <div className="tiny muted ellipsis" style={{ marginTop: 1 }}>{item.description}</div>}
              <div className="row gap-6" style={{ marginTop: 4 }}>
                <span className="bold small">{inr(item.salePrice ?? item.price)}</span>
                {item.salePrice && <span className="tiny muted" style={{ textDecoration: "line-through" }}>{inr(item.price)}</span>}
              </div>
              {item.inventoryType === "FINITE" ? (
                <button
                  className="tiny semi"
                  style={{ color: (item.quantity ?? 0) > 0 ? "var(--green-500)" : "var(--red-600)", marginTop: 4 }}
                  onClick={() => setEditing(item)}
                >
                  {(item.quantity ?? 0) > 0 ? `● ${item.quantity} in stock` : "○ Sold out — tap to restock"}
                </button>
              ) : (
                <button
                  className="tiny semi"
                  style={{ color: item.stockStatus === "OUT_OF_STOCK" ? "var(--red-600)" : "var(--green-500)", marginTop: 4 }}
                  onClick={() => toggleStock(item)}
                >
                  {item.stockStatus === "OUT_OF_STOCK" ? "○ Unavailable — tap to mark available" : "● Available"}
                </button>
              )}
            </div>
            <div className="col gap-8">
              <button className="icon-btn" style={{ width: 34, height: 34 }} onClick={() => setEditing(item)}><Pencil size={15} /></button>
              <button className="icon-btn" style={{ width: 34, height: 34, color: "var(--red-600)" }} onClick={() => remove(item)}><Trash2 size={15} /></button>
            </div>
          </div>
        ))}
      </div>

      {(creating || editing) && (
        <ItemEditor
          kind={kind}
          targetId={id}
          item={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); refetch(); }}
        />
      )}
    </div>
  );
}

function ItemEditor({
  kind, targetId, item, onClose, onSaved,
}: {
  kind: Kind;
  targetId: string;
  item: CatalogItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { showToast } = useApp();
  const service = serviceFor(kind);
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(item?.name ?? "");
  const [desc, setDesc] = useState(item?.description ?? "");
  const [price, setPrice] = useState(item?.price?.toString() ?? "");
  const [sale, setSale] = useState(item?.salePrice?.toString() ?? "");
  const [image, setImage] = useState(item?.image ?? "");
  const [best, setBest] = useState(item?.bestSeller ?? false);
  const [isFood, setIsFood] = useState(item?.isFood ?? false);
  const [isVeg, setIsVeg] = useState(item?.isVeg ?? true);
  const [invType, setInvType] = useState<"INFINITE" | "FINITE">(item?.inventoryType ?? "INFINITE");
  const [qty, setQty] = useState(item?.quantity != null ? String(item.quantity) : "");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const canSave = name.trim().length > 1 && !!price && (invType !== "FINITE" || qty !== "");

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
      const finiteQty = invType === "FINITE" ? Math.max(0, Number(qty) || 0) : null;
      const payload: Partial<CatalogItem> = {
        name,
        description: desc,
        price: Number(price),
        salePrice: sale ? Number(sale) : undefined,
        image: image || undefined,
        bestSeller: best,
        isFood,
        isVeg: isFood ? isVeg : null,
        inventoryType: invType,
        quantity: finiteQty,
        // Finite items track availability by count: restocking above zero makes
        // it available again, dropping to zero hides it. Infinite items keep
        // whatever manual availability the row already had.
        ...(invType === "FINITE" ? { stockStatus: (finiteQty ?? 0) > 0 ? "IN_STOCK" : "OUT_OF_STOCK" } : {}),
      };
      if (item) await service.updateCatalogItem(targetId, item.id, payload);
      else await service.addCatalogItem(targetId, payload);
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
        <h3 className="bold h2" style={{ marginBottom: 14 }}>{item ? "Edit listing" : "New listing"}</h3>

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
            <div className="field grow"><label>Sale price ₹</label><input className="input" inputMode="numeric" value={sale} onChange={(e) => setSale(e.target.value.replace(/\D/g, ""))} placeholder="Optional" /></div>
          </div>

          {/* Inventory mode — countable stock vs an always-available service */}
          <div className="field">
            <label>Availability</label>
            <div className="row gap-8">
              <button className={`chip ${invType === "INFINITE" ? "active" : ""}`} onClick={() => setInvType("INFINITE")} style={{ flex: 1, justifyContent: "center" }}>Always available</button>
              <button className={`chip ${invType === "FINITE" ? "active" : ""}`} onClick={() => setInvType("FINITE")} style={{ flex: 1, justifyContent: "center" }}>Limited stock</button>
            </div>
            <p className="tiny muted" style={{ marginTop: 6, lineHeight: 1.4 }}>
              {invType === "FINITE"
                ? "Each booking uses one unit. Sells out at zero — raise the count to restock."
                : "Services like a haircut or consultation — bookable any number of times."}
            </p>
          </div>

          {invType === "FINITE" && (
            <div className="field">
              <label>Quantity in stock *</label>
              <input className="input" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} placeholder="e.g. 25" />
            </div>
          )}

          <div className="field">
            <label>Is this a food item?</label>
            <div className="row gap-8">
              <button className={`chip ${isFood ? "active" : ""}`} onClick={() => setIsFood(true)} style={{ flex: 1, justifyContent: "center" }}>Food item</button>
              <button className={`chip ${!isFood ? "active" : ""}`} onClick={() => setIsFood(false)} style={{ flex: 1, justifyContent: "center" }}>Not a food item</button>
            </div>
          </div>

          {isFood && (
            <div className="field">
              <label>Veg / Non-veg</label>
              <div className="row gap-8">
                <button className={`chip ${isVeg ? "active" : ""}`} onClick={() => setIsVeg(true)} style={{ flex: 1, justifyContent: "center" }}>
                  <VegDot veg /> Veg
                </button>
                <button className={`chip ${!isVeg ? "active" : ""}`} onClick={() => setIsVeg(false)} style={{ flex: 1, justifyContent: "center" }}>
                  <VegDot veg={false} /> Non-veg
                </button>
              </div>
            </div>
          )}

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

export default function BusinessCatalogManager() {
  return <CatalogManager kind="business" />;
}
