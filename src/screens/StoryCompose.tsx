import { useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Camera, MapPin, Pencil, X, Search, Check, Globe, Star, UserMinus, Image } from "@/components/Icons";
import { AppBar, SafeImg } from "@/components/common";
import { socialService, uploadService, businessService, providerService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { useApp } from "@/store";
import { useI18n } from "@/lib/i18n";
import { currentUserId } from "@/lib/supabaseClient";
import { nativeGeolocation } from "@/lib/nativeGeolocation";
import { aliasName } from "@/lib/publicName";
import { haptics } from "@/lib/haptics";
import { STORY_DEFAULT_HOURS, STORY_HOUR_PRESETS, STORY_MAX_HOURS, STORY_MIN_HOURS, clampStoryHours } from "@/lib/stories";

interface SellerContext {
  type: "business" | "provider";
  id: string;
  name: string;
  avatar?: string;
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

type Person = { id: string; name: string; avatar: string };

export default function StoryCompose() {
  const nav = useNavigate();
  const loc = useLocation();
  const { t, tf } = useI18n();
  const { user, area, showToast, activeContext } = useApp();

  const { data: activeBiz } = useQuery(
    () => activeContext.type === "business" && activeContext.id ? businessService.get(activeContext.id) : Promise.resolve(null),
    [activeContext.id, activeContext.type],
    activeContext.type === "business" && activeContext.id ? `business:${activeContext.id}` : undefined
  );
  const { data: activeProv } = useQuery(
    () => activeContext.type === "provider" && activeContext.id ? providerService.get(activeContext.id) : Promise.resolve(null),
    [activeContext.id, activeContext.type],
    activeContext.type === "provider" && activeContext.id ? `provider:${activeContext.id}` : undefined
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
  const [hours, setHours] = useState<number>(STORY_DEFAULT_HOURS);
  const [showCustom, setShowCustom] = useState(false);
  const [customVal, setCustomVal] = useState("");
  const [uploading, setUploading] = useState(false);
  const [posting, setPosting] = useState(false);

  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  async function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const next = await uploadService.upload(file, "story");
      // Replacing the photo: the one it replaces was never posted, so it must not be left behind in storage.
      if (image) void uploadService.remove(image);
      setImage(next);
    } catch {
      showToast(t("storyc_upload_failed"));
    } finally {
      setUploading(false);
    }
  }

  // Audience
  const [visibility, setVisibility] = useState<"everyone" | "close_friends">("everyone");
  const [allowedUsers, setAllowedUsers] = useState<Person[]>([]); // close friends
  const [hiddenUsers, setHiddenUsers] = useState<Person[]>([]);   // hidden from
  const [showPrivacySheet, setShowPrivacySheet] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Person[]>([]);
  const [searching, setSearching] = useState(false);

  async function handleSearch(q: string) {
    setSearchQuery(q);
    if (!q.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      setSearchResults(await socialService.searchNeighbors(q));
    } catch (err) {
      console.warn("Search neighbors failed:", err);
    } finally {
      setSearching(false);
    }
  }

  function toggleUserSelection(u: Person) {
    const flip = (prev: Person[]) => (prev.some((x) => x.id === u.id) ? prev.filter((x) => x.id !== u.id) : [...prev, u]);
    if (visibility === "close_friends") setAllowedUsers(flip);
    else setHiddenUsers(flip);
  }

  function closePrivacySheet() {
    setShowPrivacySheet(false);
    setSearchQuery("");
    setSearchResults([]);
  }

  async function post() {
    setPosting(true);
    const expiresInHrs = clampStoryHours(hours);
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
          expiresInHrs,
          lat:          sellerLat,
          lng:          sellerLng,
          visibility:   "everyone",
        });
        void haptics.success();
        showToast(tf("storyc_live_toast_seller", { n: expiresInHrs }));
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
        // The public name strangers see: the alias, or the real name only if the person chose to show it.
        authorName:   aliasName({ alias: user.alias, name: user.name, showNamePublicly: user.showNamePublicly }, "Neighbor"),
        authorAvatar: user.avatar || "",
        imageUrl:     image,
        caption:      caption.trim(),
        cta:          "None",
        expiresInHrs,
        lat:          lat || undefined,
        lng:          lng || undefined,
        visibility:   visibility,
        allowedUserIds: allowedUsers.map((u) => u.id),
        hiddenUserIds:  hiddenUsers.map((u) => u.id),
      });
      void haptics.success();
      showToast(tf("storyc_live_toast", { n: expiresInHrs }));
      setTimeout(() => nav(-1), 600);
    } catch {
      showToast(t("storyc_post_failed"));
      setPosting(false);
    }
  }

  const presetActive = (STORY_HOUR_PRESETS as readonly number[]).includes(hours);
  const hoursLabel = hours === 1 ? t("storyc_hour_one") : tf("storyc_hours_long", { n: hours });
  const closeSelected = visibility === "close_friends";

  return (
    <div className="screen">
      <AppBar
        title={sellerCtx ? t("storyc_title_seller") : t("storyc_title_self")}
        subtitle={sellerCtx ? tf("storyc_sub_seller", { name: sellerCtx.name }) : t("storyc_sub_self")}
      />

      <div className="screen-scroll page-pad col gap-16" style={{ paddingBottom: "calc(110px + var(--safe-area-bottom))" }}>
        <input ref={galleryRef} type="file" accept="image/*" style={{ display: "none" }} onChange={pickPhoto} />
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={pickPhoto} />

        {/* The canvas: exactly what the viewer will show — the whole photo over a blurred copy, the caption on it. */}
        <div className="sc-canvas">
          {image ? (
            <>
              <img className="sc-bg" src={image} alt="" aria-hidden="true" />
              <img className="sc-img" src={image} alt={t("storyc_preview_alt")} />
              <div className="sc-shade" />
              <button className="sc-corner left" onClick={() => galleryRef.current?.click()} aria-label={t("storyc_gallery")} disabled={uploading}>
                <Image size={17} />
              </button>
              <button className="sc-corner" onClick={() => cameraRef.current?.click()} aria-label={t("storyc_retake")} disabled={uploading}>
                <Camera size={17} />
              </button>
              <input
                className="sc-caption"
                value={caption}
                maxLength={120}
                placeholder={t("storyc_caption_ph")}
                aria-label={t("storyc_caption")}
                onChange={(e) => setCaption(e.target.value)}
              />
              {caption.length > 90 && <span className="sc-count">{tf("storyc_chars_left", { n: 120 - caption.length })}</span>}
              {uploading && <div className="sc-busy">{t("storyc_uploading")}</div>}
            </>
          ) : (
            <div className="sc-empty">
              {uploading ? (
                <span className="small" style={{ color: "rgba(255,255,255,0.85)" }}>{t("storyc_uploading")}</span>
              ) : (
                <>
                  <span className="story-canvas-icon" aria-hidden="true"><Camera size={30} /></span>
                  <button className="story-canvas-btn primary" onClick={() => cameraRef.current?.click()}>
                    <Camera size={18} /> {t("storyc_take_photo")}
                  </button>
                  <button className="story-canvas-btn" onClick={() => galleryRef.current?.click()}>
                    <Image size={18} /> {t("storyc_gallery")}
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Audience — seller stories are always public and anchored to the shop's location. */}
        {sellerCtx ? (
          <div className="card row gap-10 align-center" style={{ padding: 12, background: "var(--brand-50)", border: "1px solid var(--brand-100)" }}>
            <Globe size={18} color="var(--brand-700)" />
            <span className="tiny" style={{ color: "var(--brand-700)", lineHeight: 1.4 }}>
              {tf("storyc_seller_note", { name: sellerCtx.name })}
            </span>
          </div>
        ) : (
          <button className="sc-audience" onClick={() => setShowPrivacySheet(true)}>
            <span className={`sc-audience-ico${closeSelected ? " close" : ""}`}>
              {closeSelected ? <Star size={18} weight="fill" /> : <Globe size={18} />}
            </span>
            <span className="sc-audience-txt">
              <span className="semi small">{closeSelected ? t("storyc_close_friends") : t("storyc_everyone")}</span>
              <span className="tiny muted">
                {closeSelected
                  ? tf("storyc_selected_n", { n: allowedUsers.length })
                  : hiddenUsers.length > 0 ? tf("storyc_hidden_from_n", { n: hiddenUsers.length }) : t("storyc_all_nearby")}
              </span>
            </span>
            <span className="small semi" style={{ color: "var(--brand-700)" }}>{t("storyc_edit")}</span>
          </button>
        )}

        {/* How long it stays up */}
        <div className="field">
          <label className="row between" htmlFor="storyc-hours">
            <span>{t("storyc_visible_for")}</span>
            <span style={{ color: "var(--brand-700)", fontWeight: 600 }}>{hoursLabel}</span>
          </label>
          {showCustom ? (
            <div className="row gap-8">
              <input
                id="storyc-hours"
                type="number"
                inputMode="numeric"
                min={STORY_MIN_HOURS}
                max={STORY_MAX_HOURS}
                className="input grow"
                style={{ padding: "8px 12px", fontSize: 13, height: 36 }}
                placeholder={tf("storyc_custom_ph", { min: STORY_MIN_HOURS, max: STORY_MAX_HOURS })}
                value={customVal}
                onChange={(e) => setCustomVal(e.target.value)}
                autoFocus
              />
              <button
                className="btn btn-primary btn-sm"
                style={{ height: 36, padding: "0 12px" }}
                onClick={() => {
                  const n = parseInt(customVal, 10);
                  if (!Number.isNaN(n)) setHours(clampStoryHours(n));
                  setShowCustom(false);
                }}
              >
                {t("storyc_apply")}
              </button>
              <button className="btn btn-ghost btn-sm" style={{ height: 36, padding: "0 12px" }} onClick={() => setShowCustom(false)}>
                {t("storyc_cancel")}
              </button>
            </div>
          ) : (
            <div className="row gap-8">
              {STORY_HOUR_PRESETS.map((h) => (
                <button
                  key={h}
                  className={`chip ${hours === h ? "active" : ""}`}
                  style={{ flex: 1, justifyContent: "center" }}
                  onClick={() => { setHours(h); setShowCustom(false); }}
                >
                  {tf("storyc_hours_short", { n: h })}
                </button>
              ))}
              <button
                className={`chip ${!presetActive ? "active" : ""}`}
                style={{ flex: 1, justifyContent: "center", display: "flex", alignItems: "center", gap: 4 }}
                onClick={() => { setCustomVal(presetActive ? "" : String(hours)); setShowCustom(true); }}
              >
                <Pencil size={11} strokeWidth={2.5} />
                {!presetActive ? tf("storyc_hours_short", { n: hours }) : t("storyc_custom")}
              </button>
            </div>
          )}
        </div>

        {!sellerCtx && (
          <div className="card row gap-10" style={{ padding: 12, background: "var(--brand-50)", border: "1px solid var(--brand-100)" }}>
            <MapPin size={18} color="var(--brand-700)" />
            <span className="tiny" style={{ color: "var(--brand-700)", lineHeight: 1.4 }}>
              {tf("storyc_area_note", { area: area || t("storyc_area_fallback") })}
            </span>
          </div>
        )}
      </div>

      <div className="action-bar">
        {!image && <p className="tiny muted" style={{ textAlign: "center", marginBottom: 6 }}>{t("storyc_add_photo")}</p>}
        <button className="btn btn-primary btn-block" disabled={!image || posting || uploading} onClick={() => void post()}>
          {posting ? t("storyc_posting") : uploading ? t("storyc_uploading") : t("storyc_share")}
        </button>
      </div>

      {/* Audience options. Shared overlay + sheet, so the Android back button closes it like every other sheet. */}
      {showPrivacySheet && (
        <div className="overlay" onClick={closePrivacySheet}>
          <div className="sheet" style={{ maxHeight: "82%", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
            <div className="sheet-grab" />
            <div className="row between align-center" style={{ marginBottom: 14 }}>
              <h2 className="h2" style={{ color: "var(--ink-900)", margin: 0 }}>{t("storyc_audience_title")}</h2>
              <button className="icon-btn" onClick={closePrivacySheet} aria-label={t("storyc_cancel")}><X size={18} /></button>
            </div>

            <div className="row gap-8" style={{ marginBottom: 16 }}>
              <button
                onClick={() => { setVisibility("everyone"); setSearchQuery(""); setSearchResults([]); }}
                className="row center gap-6 grow sc-seg"
                data-on={visibility === "everyone"}
              >
                <Globe size={15} /> {t("storyc_everyone")}
              </button>
              <button
                onClick={() => { setVisibility("close_friends"); setSearchQuery(""); setSearchResults([]); }}
                className="row center gap-6 grow sc-seg close"
                data-on={visibility === "close_friends"}
              >
                <Star size={15} weight={visibility === "close_friends" ? "fill" : "regular"} /> {t("storyc_close_friends")}
              </button>
            </div>

            <div style={{ background: "var(--ink-50)", border: "1px solid var(--ink-200)", borderRadius: 12, padding: 12, marginBottom: 14 }}>
              <p className="tiny muted" style={{ lineHeight: 1.4, margin: 0 }}>
                {visibility === "everyone" ? t("storyc_hint_everyone") : t("storyc_hint_close")}
              </p>
            </div>

            <div className="row align-center gap-8" style={{ background: "var(--ink-100)", border: "1px solid var(--ink-200)", borderRadius: 12, padding: "4px 12px", marginBottom: 14 }}>
              <Search size={16} color="var(--ink-500)" />
              <input
                className="grow"
                style={{ border: "none", background: "transparent", fontSize: 13.5, padding: "8px 0", outline: "none" }}
                placeholder={t("storyc_search_ph")}
                aria-label={t("storyc_search_ph")}
                value={searchQuery}
                onChange={(e) => void handleSearch(e.target.value)}
              />
            </div>

            <div style={{ overflowY: "auto", flex: 1, minHeight: 160 }} className="col gap-10">
              {searchQuery.trim() ? (
                searching ? (
                  <div className="sc-empty-line">{t("storyc_searching")}</div>
                ) : searchResults.length === 0 ? (
                  <div className="sc-empty-line">{tf("storyc_no_match", { q: searchQuery })}</div>
                ) : (
                  searchResults.map((u) => {
                    const isSelected = closeSelected ? allowedUsers.some((x) => x.id === u.id) : hiddenUsers.some((x) => x.id === u.id);
                    return (
                      <button key={u.id} onClick={() => toggleUserSelection(u)} className="row between align-center sc-person">
                        <span className="row gap-10 align-center">
                          <SafeImg src={u.avatar} variant="avatar" style={{ width: 36, height: 36 }} />
                          <span className="semi" style={{ fontSize: 13.5, color: "var(--ink-900)" }}>{u.name}</span>
                        </span>
                        <span className={`sc-check${isSelected ? " on" : ""}${closeSelected ? " close" : ""}`}>
                          {isSelected && <Check size={13} weight="bold" />}
                        </span>
                      </button>
                    );
                  })
                )
              ) : closeSelected ? (
                allowedUsers.length === 0 ? (
                  <div className="sc-empty-line">{t("storyc_close_empty")}</div>
                ) : (
                  <div className="col gap-10">
                    <div className="tiny muted">{tf("storyc_close_list", { n: allowedUsers.length })}</div>
                    {allowedUsers.map((u) => (
                      <div key={u.id} className="row between align-center" style={{ padding: "6px 0" }}>
                        <span className="row gap-10 align-center">
                          <SafeImg src={u.avatar} variant="avatar" style={{ width: 36, height: 36 }} />
                          <span className="semi" style={{ fontSize: 13.5 }}>{u.name}</span>
                        </span>
                        <button onClick={() => toggleUserSelection(u)} style={{ background: "none", border: "none", color: "var(--red-500)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                          {t("storyc_remove")}
                        </button>
                      </div>
                    ))}
                  </div>
                )
              ) : hiddenUsers.length === 0 ? (
                <div className="sc-empty-line">{t("storyc_hidden_empty")}</div>
              ) : (
                <div className="col gap-10">
                  <div className="tiny muted" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <UserMinus size={12} /> {tf("storyc_hidden_list", { n: hiddenUsers.length })}
                  </div>
                  {hiddenUsers.map((u) => (
                    <div key={u.id} className="row between align-center" style={{ padding: "6px 0" }}>
                      <span className="row gap-10 align-center">
                        <SafeImg src={u.avatar} variant="avatar" style={{ width: 36, height: 36 }} />
                        <span className="semi" style={{ fontSize: 13.5 }}>{u.name}</span>
                      </span>
                      <button onClick={() => toggleUserSelection(u)} style={{ background: "none", border: "none", color: "var(--brand-600)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                        {t("storyc_unhide")}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button onClick={closePrivacySheet} className="btn btn-primary btn-block" style={{ marginTop: 14 }}>{t("storyc_done")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
