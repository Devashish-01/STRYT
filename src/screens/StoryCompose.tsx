import { useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Camera, MapPin, Pencil, X, Search, Check, Globe, Star, UserMinus, Image } from "@/components/Icons";
import { AppBar, SafeImg } from "@/components/common";
import { socialService, uploadService, businessService, providerService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { useApp } from "@/store";
import { currentUserId } from "@/lib/supabaseClient";
import { nativeGeolocation } from "@/lib/nativeGeolocation";
import { displayName as safeName } from "@/lib/publicName";

const EXPIRY_OPTS = [1, 3, 6, 12] as const;

interface SellerContext {
  type: "business" | "provider";
  id: string;
  name: string;
  avatar?: string;
  lat?: number;
  lng?: number;
}

/** Reads the seller identity a manage-dashboard "Post a story" tile passed via route
 *  state — absent for the regular customer compose entry, in which case the story
 *  posts under the signed-in user's own name as before. Mirrors CommunityCompose.tsx. */
function readSellerContext(state: unknown): { type: "business" | "provider"; id: string; name: string; avatar?: string } | null {
  const s = (state ?? {}) as Record<string, any>;
  if (s.businessId) return { type: "business", id: s.businessId, name: s.businessName ?? "Business", avatar: s.businessAvatar };
  if (s.providerId) return { type: "provider", id: s.providerId, name: s.providerName ?? "Provider", avatar: s.providerAvatar };
  return null;
}

export default function StoryCompose() {
  const nav = useNavigate();
  const loc = useLocation();
  const { user, area, showToast, activeContext } = useApp();

  const { data: activeBiz } = useQuery(
    () => activeContext.type === "business" && activeContext.id ? businessService.get(activeContext.id) : Promise.resolve(null),
    [activeContext.id, activeContext.type]
  );
  const { data: activeProv } = useQuery(
    () => activeContext.type === "provider" && activeContext.id ? providerService.get(activeContext.id) : Promise.resolve(null),
    [activeContext.id, activeContext.type]
  );

  const passedCtx = readSellerContext(loc.state);
  const sellerCtx: SellerContext | null = passedCtx || (
    activeContext.type === "business" && activeBiz ? { type: "business" as const, id: activeBiz.id, name: activeBiz.name, avatar: activeBiz.coverImage } :
    activeContext.type === "provider" && activeProv ? { type: "provider" as const, id: activeProv.id, name: activeProv.displayName, avatar: activeProv.avatar } :
    null
  );
  // A seller's story is anchored to the business/provider's own fixed location,
  // not wherever the owner's device happens to be standing when they post.
  const sellerLat = sellerCtx?.type === "business" ? activeBiz?.lat : sellerCtx?.type === "provider" ? activeProv?.lat : undefined;
  const sellerLng = sellerCtx?.type === "business" ? activeBiz?.lng : sellerCtx?.type === "provider" ? activeProv?.lng : undefined;

  const [image, setImage] = useState("");
  const [caption, setCaption] = useState("");
  const [hours, setHours] = useState<number>(3);
  const [showCustom, setShowCustom] = useState(false);
  const [customVal, setCustomVal] = useState("");
  const [uploading, setUploading] = useState(false);
  const [posting, setPosting] = useState(false);

  // Privacy States
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  async function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      setImage(await uploadService.upload(file, "story"));
    } catch {
      showToast("Failed to upload photo");
    } finally {
      setUploading(false);
    }
  }

  const [visibility, setVisibility] = useState<"everyone" | "close_friends">("everyone");
  const [allowedUsers, setAllowedUsers] = useState<any[]>([]); // Close friends list
  const [hiddenUsers, setHiddenUsers] = useState<any[]>([]);   // Excluded users list
  const [showPrivacySheet, setShowPrivacySheet] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  async function handleSearch(q: string) {
    setSearchQuery(q);
    if (!q.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await socialService.searchNeighbors(q);
      setSearchResults(res);
    } catch (err) {
      console.warn("Search neighbors failed:", err);
    } finally {
      setSearching(false);
    }
  }

  function toggleUserSelection(u: any) {
    if (visibility === "close_friends") {
      setAllowedUsers((prev) => {
        const exists = prev.some((x) => x.id === u.id);
        if (exists) return prev.filter((x) => x.id !== u.id);
        return [...prev, u];
      });
    } else {
      setHiddenUsers((prev) => {
        const exists = prev.some((x) => x.id === u.id);
        if (exists) return prev.filter((x) => x.id !== u.id);
        return [...prev, u];
      });
    }
  }

  async function post() {
    setPosting(true);
    try {
      const uid = await currentUserId();
      if (!uid) throw new Error("Not authenticated");

      if (sellerCtx) {
        // Seller story: anchored to the business/provider's own location,
        // always public — no device geolocation, no close-friends controls.
        await socialService.postStory({
          ownerType:    sellerCtx.type,
          ownerId:      sellerCtx.id,
          userId:       uid,
          authorName:   sellerCtx.name,
          authorAvatar: sellerCtx.avatar || "",
          imageUrl:     image,
          caption:      caption.trim(),
          cta:          "None",
          expiresInHrs: hours,
          lat:          sellerLat,
          lng:          sellerLng,
          visibility:   "everyone",
        });
        showToast(`Story live for ${hours}h ✨`);
        setTimeout(() => nav(-1), 600);
        return;
      }

      let lat = user.lat;
      let lng = user.lng;
      if (!lat && !lng) {
        await new Promise<void>((resolve) => {
          nativeGeolocation.getCurrentPosition(
            (pos) => { lat = pos.coords.latitude; lng = pos.coords.longitude; resolve(); },
            () => resolve(),
            { enableHighAccuracy: true, timeout: 4000 }
          );
        });
      }

      await socialService.postStory({
        ownerType:    "user",
        userId:       uid,
        authorName:   safeName(user.name, "Neighbor"),
        authorAvatar: user.avatar || "",
        imageUrl:     image,
        caption:      caption.trim(),
        cta:          "None",
        expiresInHrs: hours,
        lat:          lat || undefined,
        lng:          lng || undefined,
        visibility:   visibility,
        allowedUserIds: allowedUsers.map((u) => u.id),
        hiddenUserIds:  hiddenUsers.map((u) => u.id),
      });
      showToast(`Story live for ${hours}h — neighbors can see it ✨`);
      setTimeout(() => nav(-1), 600);
    } catch {
      showToast("Couldn't post story. Try again.");
      setPosting(false);
    }
  }

  return (
    <div className="screen">
      <AppBar
        title={sellerCtx ? "Post a story" : "Share a moment"}
        subtitle={sellerCtx ? `Posting as ${sellerCtx.name}` : "Visible to neighbors nearby"}
      />

      <div className="screen-scroll page-pad col gap-16" style={{ paddingBottom: 90 }}>
        {/* Photo picker — phone-story aspect ratio */}
        <div style={{
          position: "relative", width: "100%",
          aspectRatio: "9/14", maxHeight: 380, borderRadius: 18, overflow: "hidden",
          border: "2px dashed var(--ink-300)", background: "#000",
        }}>
          <input ref={galleryRef} type="file" accept="image/*" style={{ display: "none" }} onChange={pickPhoto} />
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={pickPhoto} />
          {image ? (
            <>
              <img
                src={image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.95, cursor: "pointer" }}
                onClick={() => galleryRef.current?.click()}
              />
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.6), transparent 40%)", pointerEvents: "none" }} />
              {caption && (
                <div style={{ position: "absolute", bottom: 16, left: 14, right: 14, color: "#fff", fontWeight: 600, fontSize: 15, textShadow: "0 1px 4px rgba(0,0,0,0.6)" }}>
                  {caption}
                </div>
              )}
              <button
                className="icon-btn"
                style={{ position: "absolute", top: 12, right: 12, background: "rgba(0,0,0,0.45)", color: "#fff" }}
                onClick={() => cameraRef.current?.click()}
                aria-label="Retake photo"
              >
                <Camera size={16} />
              </button>
            </>
          ) : (
            <div className="col center" style={{ height: "100%", gap: 14 }}>
              {uploading ? (
                <span className="small muted">Uploading…</span>
              ) : (
                <>
                  <button className="col center muted gap-6" onClick={() => cameraRef.current?.click()}>
                    <Camera size={32} />
                    <span className="small">Take photo</span>
                  </button>
                  <button className="col center muted gap-6" onClick={() => galleryRef.current?.click()}>
                    <Image size={28} />
                    <span className="small">Choose from gallery</span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <div className="field">
          <label>Caption <span className="tiny muted">(optional)</span></label>
          <input
            className="input"
            placeholder="What's happening? 🔥"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            maxLength={120}
          />
          {caption.length > 90 && (
            <span className="tiny muted" style={{ textAlign: "right" }}>{120 - caption.length} left</span>
          )}
        </div>

        {/* Story privacy selection block — seller stories are always public and
            anchored to the business/provider's location, so there's no
            close-friends concept to configure. */}
        {sellerCtx ? (
          <div className="card row gap-10 align-center" style={{ padding: 12, background: "var(--brand-50)", border: "1px solid var(--brand-100)" }}>
            <Globe size={18} color="var(--brand-700)" />
            <span className="tiny" style={{ color: "var(--brand-700)", lineHeight: 1.4 }}>
              Visible to everyone near {sellerCtx.name}'s location
            </span>
          </div>
        ) : (
          <div className="field">
            <label>Audience & Visibility</label>
            <button
              onClick={() => setShowPrivacySheet(true)}
              className="row between align-center"
              style={{
                width: "100%",
                padding: "12px 14px",
                background: "var(--ink-50)",
                border: "1px solid var(--ink-200)",
                borderRadius: 14,
                cursor: "pointer",
                textAlign: "left"
              }}
            >
              <div className="row gap-10 align-center">
                <div style={{
                  width: 36, height: 36, borderRadius: "50%",
                  background: visibility === "everyone" ? "rgba(124,58,237,0.1)" : "rgba(34,197,94,0.1)",
                  display: "flex", alignItems: "center", justifyContent: "center"
                }}>
                  {visibility === "everyone" ? (
                    <Globe size={18} color="var(--brand-600)" />
                  ) : (
                    <Star size={18} color="#22c55e" fill="#22c55e" />
                  )}
                </div>
                <div className="col" style={{ gap: 0 }}>
                  <span className="semi small" style={{ color: "var(--ink-900)" }}>
                    {visibility === "everyone" ? "Everyone" : "Close Friends"}
                  </span>
                  <span className="tiny muted">
                    {visibility === "everyone"
                      ? (hiddenUsers.length > 0 ? `Hidden from ${hiddenUsers.length} neighbors` : "All nearby neighbors can see it")
                      : `${allowedUsers.length} selected neighbors`}
                  </span>
                </div>
              </div>
              <span className="small semi text-brand">Edit</span>
            </button>
          </div>
        )}

        <div className="field">
          <label className="row between">
            <span>Visible for</span>
            {hours > 0 && <span style={{ color: "var(--brand-700)", fontWeight: 600 }}>{hours} hour{hours > 1 ? "s" : ""}</span>}
          </label>
          {showCustom ? (
            <div className="row gap-8">
              <input
                type="number"
                min={1}
                max={168}
                className="input grow"
                style={{ padding: "8px 12px", fontSize: 13, height: 36 }}
                placeholder="Duration in hours..."
                value={customVal}
                onChange={(e) => setCustomVal(e.target.value)}
                autoFocus
              />
              <button
                className="btn btn-primary btn-sm"
                style={{ height: 36, padding: "0 12px" }}
                onClick={() => {
                  const n = parseInt(customVal);
                  if (!isNaN(n) && n > 0) setHours(n);
                  setShowCustom(false);
                }}
              >
                Apply
              </button>
              <button
                className="btn btn-ghost btn-sm"
                style={{ height: 36, padding: "0 12px" }}
                onClick={() => setShowCustom(false)}
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="row gap-8">
              {EXPIRY_OPTS.map((h) => {
                const active = hours === h;
                return (
                  <button
                    key={h}
                    className={`chip ${active ? "active" : ""}`}
                    style={{ flex: 1, justifyContent: "center" }}
                    onClick={() => { setHours(h); setShowCustom(false); }}
                  >
                    {h}h
                  </button>
                );
              })}
              <button
                className={`chip ${!new Set<number>(EXPIRY_OPTS).has(hours) ? "active" : ""}`}
                style={{ flex: 1, justifyContent: "center", display: "flex", alignItems: "center", gap: 4 }}
                onClick={() => {
                  setCustomVal(!new Set<number>(EXPIRY_OPTS).has(hours) ? String(hours) : "");
                  setShowCustom(true);
                }}
              >
                <Pencil size={11} strokeWidth={2.5} />
                {!new Set<number>(EXPIRY_OPTS).has(hours) ? `${hours}h` : "Custom"}
              </button>
            </div>
          )}
        </div>

        {!sellerCtx && (
          <div className="card row gap-10" style={{ padding: 12, background: "var(--brand-50)", border: "1px solid var(--brand-100)" }}>
            <MapPin size={18} color="var(--brand-700)" />
            <span className="tiny" style={{ color: "var(--brand-700)", lineHeight: 1.4 }}>
              Visible within ~2 km of <strong>{area || "your location"}</strong> · auto-detected
            </span>
          </div>
        )}
      </div>

      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid var(--line)", padding: 12 }}>
        {!image && (
          <p className="tiny muted" style={{ textAlign: "center", marginBottom: 6 }}>Add a photo to continue</p>
        )}
        <button
          className="btn btn-primary btn-block"
          disabled={!image || posting || uploading}
          onClick={() => void post()}
        >
          {posting ? "Posting…" : uploading ? "Uploading photo…" : "Share story"}
        </button>
      </div>

      {/* Story Privacy Options Drawer Sheet */}
      {showPrivacySheet && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 110,
          display: "flex", flexDirection: "column", justifyContent: "flex-end",
          maxWidth: "var(--maxw)", left: "50%", transform: "translateX(-50%)"
        }}>
          <div style={{ flex: 1 }} onClick={() => setShowPrivacySheet(false)} />
          
          <div style={{
            background: "#fff",
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            maxHeight: "75%",
            display: "flex",
            flexDirection: "column",
            animation: "slideUp 0.25s ease-out",
            padding: "24px 20px 30px"
          }}>
            <div className="row between align-center" style={{ marginBottom: 16 }}>
              <h2 className="h2" style={{ color: "var(--ink-900)", margin: 0 }}>
                Audience Options
              </h2>
              <button
                onClick={() => { setShowPrivacySheet(false); setSearchQuery(""); setSearchResults([]); }}
                style={{
                  background: "var(--ink-100)",
                  border: "none",
                  borderRadius: "50%",
                  width: 32,
                  height: 32,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer"
                }}
              >
                <X size={18} color="var(--ink-700)" />
              </button>
            </div>

            {/* Audience Tabs */}
            <div className="row gap-8" style={{ marginBottom: 20 }}>
              <button
                onClick={() => { setVisibility("everyone"); setSearchQuery(""); setSearchResults([]); }}
                className={`row center gap-6 grow`}
                style={{
                  padding: "12px 10px",
                  borderRadius: 12,
                  fontWeight: 700,
                  fontSize: 13,
                  border: "1.5px solid",
                  background: visibility === "everyone" ? "rgba(124,58,237,0.06)" : "#fff",
                  borderColor: visibility === "everyone" ? "var(--brand-600)" : "var(--ink-200)",
                  color: visibility === "everyone" ? "var(--brand-700)" : "var(--ink-700)",
                  cursor: "pointer"
                }}
              >
                <Globe size={15} /> Everyone
              </button>
              <button
                onClick={() => { setVisibility("close_friends"); setSearchQuery(""); setSearchResults([]); }}
                className={`row center gap-6 grow`}
                style={{
                  padding: "12px 10px",
                  borderRadius: 12,
                  fontWeight: 700,
                  fontSize: 13,
                  border: "1.5px solid",
                  background: visibility === "close_friends" ? "rgba(34,197,94,0.06)" : "#fff",
                  borderColor: visibility === "close_friends" ? "#22c55e" : "var(--ink-200)",
                  color: visibility === "close_friends" ? "var(--green-500)" : "var(--ink-700)",
                  cursor: "pointer"
                }}
              >
                <Star size={15} fill={visibility === "close_friends" ? "var(--green-500)" : "none"} /> Close Friends
              </button>
            </div>

            <div style={{ background: "var(--ink-50)", border: "1px solid var(--ink-200)", borderRadius: 12, padding: 12, marginBottom: 16 }}>
              <p className="tiny muted" style={{ lineHeight: 1.4, margin: 0 }}>
                {visibility === "everyone"
                  ? "Your story is visible to neighbors nearby. You can search below to select specific neighbors to hide this story from."
                  : "Your story is only visible to neighbors on your Close Friends list. Search below to add/remove friends."}
              </p>
            </div>

            {/* Search Input */}
            <div className="row align-center gap-8" style={{
              background: "var(--ink-100)",
              border: "1px solid var(--ink-200)",
              borderRadius: 12,
              padding: "4px 12px",
              marginBottom: 16
            }}>
              <Search size={16} color="var(--ink-500)" />
              <input
                className="grow"
                style={{
                  border: "none",
                  background: "transparent",
                  fontSize: 13.5,
                  padding: "8px 0",
                  outline: "none"
                }}
                placeholder="Search neighbor's name or @handle..."
                value={searchQuery}
                onChange={(e) => void handleSearch(e.target.value)}
              />
            </div>

            {/* Selection list */}
            <div style={{ overflowY: "auto", flex: 1, minHeight: 180 }} className="col gap-10">
              {searchQuery.trim() ? (
                // Render Search Results
                searching ? (
                  <div style={{ textAlign: "center", padding: "30px 0", color: "var(--ink-400)", fontSize: 13 }}>
                    Searching...
                  </div>
                ) : searchResults.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "30px 0", color: "var(--ink-400)", fontSize: 13 }}>
                    No neighbors found matching "{searchQuery}"
                  </div>
                ) : (
                  searchResults.map((u) => {
                    const isSelected = visibility === "close_friends"
                      ? allowedUsers.some((x) => x.id === u.id)
                      : hiddenUsers.some((x) => x.id === u.id);

                    return (
                      <div
                        key={u.id}
                        onClick={() => toggleUserSelection(u)}
                        className="row between align-center"
                        style={{ padding: "6px 0", cursor: "pointer" }}
                      >
                        <div className="row gap-10 align-center">
                          <SafeImg
                            src={u.avatar}
                            variant="avatar"
                            style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover" }}
                          />
                          <div className="col" style={{ gap: 0 }}>
                            <span className="semi" style={{ fontSize: 13.5, color: "var(--ink-900)" }}>
                              {u.name}
                            </span>
                          </div>
                        </div>

                        <div style={{
                          width: 22, height: 22, borderRadius: "50%",
                          border: isSelected ? "none" : "2px solid var(--ink-300)",
                          background: isSelected ? (visibility === "close_friends" ? "#22c55e" : "var(--brand-600)") : "transparent",
                          display: "flex", alignItems: "center", justifyContent: "center"
                        }}>
                          {isSelected && <Check size={13} color="#fff" strokeWidth={3} />}
                        </div>
                      </div>
                    );
                  })
                )
              ) : (
                // Render Selected lists
                visibility === "close_friends" ? (
                  allowedUsers.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "40px 0", color: "var(--ink-400)", fontSize: 13.5 }}>
                      No close friends selected. <br /> Use the search bar to select friends.
                    </div>
                  ) : (
                    <div className="col gap-10">
                      <div className="tiny muted">Close Friends ({allowedUsers.length})</div>
                      {allowedUsers.map((u) => (
                        <div key={u.id} className="row between align-center" style={{ padding: "6px 0" }}>
                          <div className="row gap-10 align-center">
                            <SafeImg src={u.avatar} variant="avatar" style={{ width: 36, height: 36, borderRadius: "50%" }} />
                            <div className="col" style={{ gap: 0 }}>
                              <span className="semi text-dark" style={{ fontSize: 13.5 }}>{u.name}</span>
                            </div>
                          </div>
                          <button
                            onClick={() => toggleUserSelection(u)}
                            style={{ background: "none", border: "none", color: "var(--red-500)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )
                ) : (
                  hiddenUsers.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "40px 0", color: "var(--ink-400)", fontSize: 13.5 }}>
                      Story is visible to all neighbors. <br /> Search above to hide this story from specific users.
                    </div>
                  ) : (
                    <div className="col gap-10">
                      <div className="tiny muted" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <UserMinus size={12} /> Hidden From ({hiddenUsers.length})
                      </div>
                      {hiddenUsers.map((u) => (
                        <div key={u.id} className="row between align-center" style={{ padding: "6px 0" }}>
                          <div className="row gap-10 align-center">
                            <SafeImg src={u.avatar} variant="avatar" style={{ width: 36, height: 36, borderRadius: "50%" }} />
                            <div className="col" style={{ gap: 0 }}>
                              <span className="semi text-dark" style={{ fontSize: 13.5 }}>{u.name}</span>
                            </div>
                          </div>
                          <button
                            onClick={() => toggleUserSelection(u)}
                            style={{ background: "none", border: "none", color: "var(--brand-600)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                          >
                            Unhide
                          </button>
                        </div>
                      ))}
                    </div>
                  )
                )
              )}
            </div>
            
            <button
              onClick={() => { setShowPrivacySheet(false); setSearchQuery(""); setSearchResults([]); }}
              className="btn btn-primary btn-block"
              style={{ marginTop: 16 }}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
