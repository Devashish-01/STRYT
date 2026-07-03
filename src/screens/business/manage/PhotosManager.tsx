import { useRef } from "react";
import { useParams } from "react-router-dom";
import { AppBar, SafeImg } from "@/components/common";
import { Camera, Trash2, Star } from "lucide-react";
import { businessService, uploadService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { Skeleton, ErrorView } from "@/components/states";
import { useApp } from "@/store";
import { useState } from "react";

export default function PhotosManager() {
  const { id = "" } = useParams();
  const { data: b, loading, refetch } = useQuery(() => businessService.get(id), [id]);
  const { showToast } = useApp();

  if (!id) {
    return (
      <div className="screen">
        <AppBar title="Photos" />
        <ErrorView error={{ code: "BAD_REQUEST", message: "Missing target ID parameter." } as any} />
      </div>
    );
  }
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  if (loading) {
    return (
      <div className="screen">
        <AppBar title="Photos" />
        <div className="page-pad" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} h={130} mb={0} />)}
        </div>
      </div>
    );
  }
  if (!b) return null;

  // All photos: cover first, then gallery (excluding cover to avoid duplicate).
  const allPhotos = [
    b.coverImage,
    ...b.gallery.filter((u) => u !== b.coverImage),
  ].filter(Boolean) as string[];

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadService.upload(file, "business-photo");
      await businessService.addPhoto(id, url);
      showToast("Photo added");
      refetch();
    } catch {
      showToast("Upload failed. Try again.");
    } finally {
      setUploading(false);
      // Reset input so the same file can be re-selected.
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function deletePhoto(url: string) {
    try {
      await businessService.deletePhoto(id, url);
      showToast("Photo removed");
      refetch();
    } catch {
      showToast("Couldn't remove. Try again.");
    }
  }

  async function setCover(url: string) {
    try {
      await businessService.setCoverPhoto(id, url);
      showToast("Cover photo updated");
      refetch();
    } catch {
      showToast("Couldn't update cover. Try again.");
    }
  }

  return (
    <div className="screen">
      <AppBar title="Photos" subtitle={`${allPhotos.length} photo${allPhotos.length !== 1 ? "s" : ""}`} />
      <div className="screen-scroll page-pad" style={{ paddingBottom: 30 }}>
        {/* Upload button */}
        <label style={{ display: "block", marginBottom: 14, cursor: "pointer" }}>
          <div className="btn btn-ghost btn-block" style={{ pointerEvents: "none" }}>
            <Camera size={18} /> {uploading ? "Uploading…" : "Upload photo"}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={handleFileChange}
            disabled={uploading}
          />
        </label>

        {allPhotos.length === 0 && (
          <p className="muted small center" style={{ padding: 40 }}>No photos yet. Add a cover photo to attract customers.</p>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {allPhotos.map((url, i) => {
            const isCover = url === b.coverImage || i === 0;
            return (
              <div key={url} style={{ position: "relative" }}>
                <SafeImg src={url} className="thumb" style={{ width: "100%", height: 130, borderRadius: 14, objectFit: "cover" }} />
                {isCover && (
                  <span className="badge badge-purple" style={{ position: "absolute", top: 8, left: 8 }}>
                    <Star size={10} /> Cover
                  </span>
                )}
                <div className="row gap-6" style={{ position: "absolute", bottom: 8, right: 8 }}>
                  {!isCover && (
                    <button
                      className="icon-btn"
                      style={{ width: 30, height: 30, background: "rgba(255,255,255,0.95)" }}
                      onClick={() => setCover(url)}
                      title="Set as cover"
                    >
                      <Star size={14} />
                    </button>
                  )}
                  <button
                    className="icon-btn"
                    style={{ width: 30, height: 30, background: "rgba(255,255,255,0.95)", color: "var(--red-600)" }}
                    onClick={() => deletePhoto(url)}
                    title="Delete photo"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
