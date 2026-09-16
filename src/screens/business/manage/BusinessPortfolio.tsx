import { useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { AppBar, SafeImg } from "@/components/common";
import { Camera, Pencil, Trash2, Check, X } from "@/components/Icons";
import { businessService, uploadService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { Skeleton, ErrorView } from "@/components/states";
import { useApp } from "@/store";
import ManageNav from "./ManageNav";

export default function BusinessPortfolio() {
  const { id = "" } = useParams();
  // The owner's own rows, not the public profile's enriched list — that one substitutes curated stand-ins for a shop
  // with no samples, and captioning or deleting one of those hits an id that doesn't exist (PORT-1).
  const { data: items, loading, refetch } = useQuery(() => businessService.portfolioItems(id), [id], `business:${id}:portfolio-items`);
  const { showToast } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [editingCaption, setEditingCaption] = useState<string | null>(null);
  const [captionVal, setCaptionVal] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; url: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  if (!id) {
    return (
      <div className="screen">
        <AppBar title="Portfolio" />
        <ErrorView error={{ code: "BAD_REQUEST", message: "Missing target ID parameter." } as any} />
      </div>
    );
  }

  const portfolio = items ?? [];

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadService.upload(file, "portfolio");
      await businessService.addPortfolio(id, { url, caption: "" });
      showToast("Added to portfolio");
      refetch();
    } catch {
      showToast("Upload failed. Try again.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function deleteItem(itemId: string) {
    setDeleting(true);
    try {
      await businessService.deletePortfolio(id, itemId);
      showToast("Removed from portfolio");
      setConfirmDelete(null);
      refetch();
    } catch (e: any) {
      showToast(e?.message || "Couldn't remove. Try again.");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="screen with-nav">
        <AppBar title="Portfolio" />
        <div className="page-pad" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} h={130} mb={0} />)}
        </div>
        <ManageNav bizId={id} />
      </div>
    );
  }
  return (
    <div className="screen with-nav">
      <AppBar title="Portfolio" subtitle={`${portfolio.length} sample${portfolio.length !== 1 ? "s" : ""} of past work`} />
      <div className="screen-scroll page-pad" style={{ paddingBottom: 20 }}>
        <label style={{ display: "block", marginBottom: 14, cursor: "pointer" }}>
          <div className="btn btn-ghost btn-block" style={{ pointerEvents: "none" }}>
            <Camera size={18} /> {uploading ? "Uploading…" : "Add work sample"}
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFileChange} disabled={uploading} />
        </label>

        {portfolio.length === 0 && (
          <p className="muted small center" style={{ padding: 40 }}>
            No samples yet. Add photos of your past work — customers see these on your shop profile.
          </p>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {portfolio.map((item) => (
            <div key={item.id} style={{ position: "relative" }}>
              <SafeImg src={item.url} className="thumb" style={{ width: "100%", height: 130, borderRadius: 14, objectFit: "cover" }} />

              {editingCaption === item.id ? (
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(0,0,0,0.75)", borderRadius: "0 0 14px 14px", padding: "6px 8px", display: "flex", gap: 4 }}>
                  <input
                    className="input"
                    style={{ flex: 1, padding: "4px 8px", fontSize: 12, background: "rgba(255,255,255,0.9)" }}
                    value={captionVal}
                    onChange={(e) => setCaptionVal(e.target.value)}
                    placeholder="Add caption…"
                    autoFocus
                  />
                  <button
                    className="icon-btn"
                    aria-label="Save caption"
                    style={{ width: 40, height: 40, background: "var(--green-500)", color: "var(--white)", flexShrink: 0 }}
                    onClick={async () => {
                      try {
                        await businessService.updatePortfolio(id, item.id, { caption: captionVal });
                        setEditingCaption(null);
                        refetch();
                      } catch (e: any) {
                        showToast(e?.message || "Couldn't save caption — try again");
                      }
                    }}
                  >
                    <Check size={14} />
                  </button>
                  {/* Leaving the editor kept whatever was typed with no way back (PORT-6). */}
                  <button
                    className="icon-btn"
                    aria-label="Cancel caption edit"
                    style={{ width: 40, height: 40, background: "rgba(255,255,255,0.92)", flexShrink: 0 }}
                    onClick={() => { setEditingCaption(null); setCaptionVal(""); }}
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <>
                  {item.caption && (
                    <span className="tiny" style={{ position: "absolute", bottom: 46, left: 8, color: "var(--white)", textShadow: "0 1px 3px rgba(0,0,0,0.7)" }}>
                      {item.caption}
                    </span>
                  )}
                  <div className="row gap-6" style={{ position: "absolute", bottom: 8, right: 8 }}>
                    {/* 28px buttons sitting next to each other on a photo made deleting a sample a mis-tap away,
                        with no confirmation and no undo (PORT-2). */}
                    <button
                      className="icon-btn"
                      style={{ width: 40, height: 40, background: "rgba(255,255,255,0.92)" }}
                      onClick={() => { setEditingCaption(item.id); setCaptionVal(item.caption); }}
                      aria-label="Edit caption"
                      title="Edit caption"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      className="icon-btn"
                      style={{ width: 40, height: 40, background: "rgba(255,255,255,0.92)", color: "var(--red-600)" }}
                      onClick={() => setConfirmDelete({ id: item.id, url: item.url })}
                      aria-label="Delete work sample"
                      title="Delete"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
      {confirmDelete && (
        <div className="overlay" onClick={() => !deleting && setConfirmDelete(null)}>
          <div className="sheet" role="dialog" aria-label="Remove this work sample?" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-grab" />
            <h3 className="bold h2" style={{ marginBottom: 6 }}>Remove this work sample?</h3>
            <p className="small muted" style={{ marginBottom: 14 }}>It disappears from your shop profile straight away. You can upload it again later.</p>
            <SafeImg src={confirmDelete.url} className="thumb" style={{ width: "100%", height: 150, borderRadius: 14, objectFit: "cover", marginBottom: 14 }} />
            <div className="row gap-10">
              <button className="btn btn-outline grow" disabled={deleting} onClick={() => setConfirmDelete(null)}>Keep it</button>
              <button className="btn btn-red grow" disabled={deleting} onClick={() => deleteItem(confirmDelete.id)}>
                {deleting ? "Removing…" : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}
      <ManageNav bizId={id} />
    </div>
  );
}
