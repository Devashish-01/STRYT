import { useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { AppBar, SafeImg } from "@/components/common";
import { Camera, Pencil, Trash2, Check } from "@/components/Icons";
import { businessService, uploadService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { Skeleton, ErrorView } from "@/components/states";
import { useApp } from "@/store";
import ManageNav from "./ManageNav";

export default function BusinessPortfolio() {
  const { id = "" } = useParams();
  const { data: b, loading, refetch } = useQuery(() => businessService.get(id), [id], `business:${id}`);
  const { showToast } = useApp();

  if (!id) {
    return (
      <div className="screen">
        <AppBar title="Portfolio" />
        <ErrorView error={{ code: "BAD_REQUEST", message: "Missing target ID parameter." } as any} />
      </div>
    );
  }
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [editingCaption, setEditingCaption] = useState<string | null>(null);
  const [captionVal, setCaptionVal] = useState("");

  const portfolio = b?.portfolio ?? [];

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
    try {
      await businessService.deletePortfolio(id, itemId);
      showToast("Removed from portfolio");
      refetch();
    } catch {
      showToast("Couldn't remove. Try again.");
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
  if (!b) return null;

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
                    style={{ width: 28, height: 28, background: "var(--green-500)", color: "#fff", flexShrink: 0 }}
                    onClick={async () => {
                      await businessService.updatePortfolio(id, item.id, { caption: captionVal });
                      setEditingCaption(null);
                      refetch();
                    }}
                  >
                    <Check size={14} />
                  </button>
                </div>
              ) : (
                <>
                  {item.caption && (
                    <span className="tiny" style={{ position: "absolute", bottom: 36, left: 8, color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,0.7)" }}>
                      {item.caption}
                    </span>
                  )}
                  <div className="row gap-6" style={{ position: "absolute", bottom: 8, right: 8 }}>
                    <button
                      className="icon-btn"
                      style={{ width: 28, height: 28, background: "rgba(255,255,255,0.92)" }}
                      onClick={() => { setEditingCaption(item.id); setCaptionVal(item.caption); }}
                      title="Edit caption"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      className="icon-btn"
                      style={{ width: 28, height: 28, background: "rgba(255,255,255,0.92)", color: "var(--red-600)" }}
                      onClick={() => deleteItem(item.id)}
                      title="Delete"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
      <ManageNav bizId={id} />
    </div>
  );
}
