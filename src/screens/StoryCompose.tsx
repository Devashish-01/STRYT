import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  ArrowRight,
  Camera,
  Check,
  Clock,
  Globe,
  Image,
  MapPin,
  Repeat,
  Search,
  Sparkles,
  Star,
  UserMinus,
  X,
} from "@/components/Icons";
import { SafeImg } from "@/components/common";
import { socialService, uploadService, businessService, providerService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { useApp } from "@/store";
import { useI18n } from "@/lib/i18n";
import { currentUserId } from "@/lib/supabaseClient";
import { nativeGeolocation } from "@/lib/nativeGeolocation";
import { aliasName } from "@/lib/publicName";
import { haptics } from "@/lib/haptics";
import { STORY_DEFAULT_HOURS, STORY_MAX_HOURS, clampStoryHours } from "@/lib/stories";
import {
  STORY_BACKDROPS,
  STORY_FILTERS,
  STORY_TEXT_COLORS,
  clampOverlayPct,
  renderStoryToFile,
  type StoryFitMode,
  type StorySticker,
  type StoryTextLayer,
} from "@/lib/storyCanvas";
import StoryDurationSheet from "@/components/stories/compose/StoryDurationSheet";
import StoryTextSheet from "@/components/stories/compose/StoryTextSheet";
import StoryStickersSheet from "@/components/stories/compose/StoryStickersSheet";

interface SellerContext {
  type: "business" | "provider";
  id: string;
  name: string;
  avatar?: string;
}

/** Reads the seller identity a manage-dashboard "Post a story" tile passed via route
 *  state — absent for the regular customer compose entry, in which case the story
 *  posts under the signed-in user's own name as before. Mirrors CommunityCompose.tsx. */
function readSellerContext(state: unknown): SellerContext | null {
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
    () => (activeContext.type === "business" && activeContext.id ? businessService.get(activeContext.id) : Promise.resolve(null)),
    [activeContext.id, activeContext.type],
    activeContext.type === "business" && activeContext.id ? `business:${activeContext.id}` : undefined,
  );
  const { data: activeProv } = useQuery(
    () => (activeContext.type === "provider" && activeContext.id ? providerService.get(activeContext.id) : Promise.resolve(null)),
    [activeContext.id, activeContext.type],
    activeContext.type === "provider" && activeContext.id ? `provider:${activeContext.id}` : undefined,
  );

  const passedCtx = readSellerContext(loc.state);
  const sellerCtx: SellerContext | null = passedCtx || (
    activeContext.type === "business" && activeBiz ? { type: "business" as const, id: activeBiz.id, name: activeBiz.name, avatar: activeBiz.coverImage }
    : activeContext.type === "provider" && activeProv ? { type: "provider" as const, id: activeProv.id, name: activeProv.displayName, avatar: activeProv.avatar }
    : null
  );

  const sellerLat = sellerCtx?.type === "business" ? activeBiz?.lat : sellerCtx?.type === "provider" ? activeProv?.lat : undefined;
  const sellerLng = sellerCtx?.type === "business" ? activeBiz?.lng : sellerCtx?.type === "provider" ? activeProv?.lng : undefined;

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [createMode, setCreateMode] = useState(false); // Text-only / gradient story ("Aa Create")
  const [backdropId, setBackdropId] = useState<string>(STORY_BACKDROPS[0].id);
  const [filterId, setFilterId] = useState<string>(STORY_FILTERS[0].id);
  const [fitMode, setFitMode] = useState<StoryFitMode>("cover");
  const [showEffectsTray, setShowEffectsTray] = useState(false);

  const [textLayer, setTextLayer] = useState<StoryTextLayer | null>(null);
  const [stickers, setStickers] = useState<StorySticker[]>([]);
  const [hours, setHours] = useState<number>(STORY_DEFAULT_HOURS);
  const [posting, setPosting] = useState(false);

  // Active sub-sheets / modals
  const [durationOpen, setDurationOpen] = useState(false);
  const [textOpen, setTextOpen] = useState(false);
  const [stickersOpen, setStickersOpen] = useState(false);
  const [showPrivacySheet, setShowPrivacySheet] = useState(false);

  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Drag state for repositioning text vertically or moving stickers freely
  const dragState = useRef<{
    kind: "text" | "sticker";
    id?: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPhotoFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setCreateMode(false);
  }

  function startCreateStory() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPhotoFile(null);
    setPreviewUrl("");
    setCreateMode(true);
    setShowEffectsTray(true);
    setTextOpen(true);
  }

  function addSticker(st: Omit<StorySticker, "id">) {
    setStickers((prev) => [...prev, { ...st, id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}` }]);
  }

  function removeSticker(id: string) {
    setStickers((prev) => prev.filter((s) => s.id !== id));
  }

  function onStagePointerMove(e: React.PointerEvent) {
    const drag = dragState.current;
    const box = canvasRef.current?.getBoundingClientRect();
    if (!drag || !box || box.width === 0 || box.height === 0) return;

    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    drag.moved = true;

    if (drag.kind === "text") {
      const nextY = clampOverlayPct(drag.origY + dy / box.height, 0.14, 0.86);
      setTextLayer((prev) => (prev ? { ...prev, yPct: nextY } : prev));
    } else if (drag.kind === "sticker" && drag.id) {
      const nextX = clampOverlayPct(drag.origX + dx / box.width, 0.12, 0.88);
      const nextY = clampOverlayPct(drag.origY + dy / box.height, 0.14, 0.84);
      setStickers((prev) =>
        prev.map((s) => (s.id === drag.id ? { ...s, xPct: nextX, yPct: nextY } : s)),
      );
    }
  }

  function endDrag() {
    const drag = dragState.current;
    dragState.current = null;
    if (drag && !drag.moved && drag.kind === "text") {
      setTextOpen(true);
    }
  }

  // Audience
  const [visibility, setVisibility] = useState<"everyone" | "close_friends">("everyone");
  const [allowedUsers, setAllowedUsers] = useState<Person[]>([]);
  const [hiddenUsers, setHiddenUsers] = useState<Person[]>([]);
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

  const hasContent = !!previewUrl || (createMode && (!!textLayer?.text.trim() || stickers.length > 0));
  const needsRender = !!textLayer?.text.trim() || stickers.length > 0 || filterId !== "original" || fitMode === "cover" || createMode;

  async function post() {
    if (!hasContent || posting) return;
    setPosting(true);
    const expiresInHrs = clampStoryHours(hours);
    let uploadedUrl = "";

    try {
      const uid = await currentUserId();
      if (!uid) throw new Error("Not authenticated");

      let fileToUpload: File | null = photoFile;
      if (needsRender) {
        const composed = await renderStoryToFile({
          imageSrc: previewUrl || undefined,
          backdropId,
          filterId,
          fitMode,
          textLayer,
          stickers,
        });
        if (composed) fileToUpload = composed;
      }
      if (!fileToUpload) throw new Error("Missing story image");

      uploadedUrl = await uploadService.upload(fileToUpload, "story");

      // Text/stickers/filters are baked directly onto the uploaded 9:16 image so StoryViewer
      // renders them accurately without overlapping duplicate caption text on top.
      const captionForRow = "";

      if (sellerCtx) {
        await socialService.postStory({
          ownerType: sellerCtx.type,
          ownerId: sellerCtx.id,
          userId: uid,
          authorName: sellerCtx.name,
          authorAvatar: sellerCtx.avatar || "",
          imageUrl: uploadedUrl,
          caption: captionForRow,
          cta: "None",
          expiresInHrs,
          lat: sellerLat,
          lng: sellerLng,
          visibility: "everyone",
        });
        void haptics.success();
        showToast(tf("storyc_live_toast_seller", { n: expiresInHrs }));
        setTimeout(() => nav(-1), 450);
        return;
      }

      let lat = user.lat;
      let lng = user.lng;
      if (!lat && !lng) {
        await new Promise<void>((resolve) => {
          nativeGeolocation.getCurrentPosition(
            (pos) => { lat = pos.coords.latitude; lng = pos.coords.longitude; resolve(); },
            () => resolve(),
            { enableHighAccuracy: true, timeout: 4000 },
          );
        });
      }

      await socialService.postStory({
        ownerType: "user",
        userId: uid,
        authorName: aliasName({ alias: user.alias, name: user.name, showNamePublicly: user.showNamePublicly }, "Neighbor"),
        authorAvatar: user.avatar || "",
        imageUrl: uploadedUrl,
        caption: captionForRow,
        cta: "None",
        expiresInHrs,
        lat: lat || undefined,
        lng: lng || undefined,
        visibility,
        allowedUserIds: allowedUsers.map((u) => u.id),
        hiddenUserIds: hiddenUsers.map((u) => u.id),
      });
      void haptics.success();
      showToast(tf("storyc_live_toast", { n: expiresInHrs }));
      setTimeout(() => nav(-1), 450);
    } catch {
      if (uploadedUrl) void uploadService.remove(uploadedUrl);
      showToast(t("storyc_post_failed"));
      setPosting(false);
    }
  }

  const activeFilter = STORY_FILTERS.find((f) => f.id === filterId) ?? STORY_FILTERS[0];
  const activeBackdrop = STORY_BACKDROPS.find((b) => b.id === backdropId) ?? STORY_BACKDROPS[0];
  const durationBadge = hours === STORY_MAX_HOURS
    ? tf("storyc_days_short", { n: 7 })
    : tf("storyc_hours_short", { n: hours });
  const closeSelected = visibility === "close_friends";
  const locationLabel = sellerCtx?.name || area || t("storyc_area_fallback");
  const activeColorMeta = textLayer
    ? (STORY_TEXT_COLORS.find((c) => c.id === textLayer.colorId) ?? STORY_TEXT_COLORS[0])
    : STORY_TEXT_COLORS[0];

  return (
    <div className="sc-studio">
      <input ref={galleryRef} type="file" accept="image/*" style={{ display: "none" }} onChange={pickPhoto} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={pickPhoto} />

      <div
        ref={canvasRef}
        className="sc-stage"
        style={{
          background: `linear-gradient(160deg, var(${activeBackdrop.fromToken}) 0%, var(${activeBackdrop.toToken}) 100%)`,
        }}
        onPointerMove={onStagePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {/* Photo canvas */}
        {previewUrl ? (
          <>
            {fitMode === "contain" && (
              <img
                className="sc-bg"
                src={previewUrl}
                alt=""
                aria-hidden="true"
                style={{ filter: `blur(26px) brightness(0.55)${activeFilter.cssFilter !== "none" ? ` ${activeFilter.cssFilter}` : ""}` }}
              />
            )}
            <img
              className={`sc-img ${fitMode}`}
              src={previewUrl}
              alt={t("storyc_preview_alt")}
              style={{ filter: activeFilter.cssFilter === "none" ? undefined : activeFilter.cssFilter }}
              draggable={false}
            />
          </>
        ) : !createMode ? (
          <div className="sc-empty-studio">
            <span className="story-canvas-icon" aria-hidden="true"><Camera size={30} /></span>
            <h1 className="h2" style={{ color: "var(--white)", margin: "2px 0 0", textAlign: "center" }}>
              {sellerCtx ? t("storyc_title_seller") : t("storyc_title_self")}
            </h1>
            <p className="small" style={{ color: "rgba(255,255,255,0.75)", margin: "0 0 8px", textAlign: "center" }}>
              {sellerCtx ? tf("storyc_sub_seller", { name: sellerCtx.name }) : t("storyc_sub_self")}
            </p>
            <button type="button" className="story-canvas-btn primary" onClick={() => cameraRef.current?.click()}>
              <Camera size={18} /> {t("storyc_take_photo")}
            </button>
            <button type="button" className="story-canvas-btn" onClick={() => galleryRef.current?.click()}>
              <Image size={18} /> {t("storyc_gallery")}
            </button>
            <button type="button" className="story-canvas-btn" onClick={startCreateStory}>
              <span className="bold" style={{ fontSize: 15 }}>Aa</span> {t("storyc_create_text")}
            </button>
          </div>
        ) : null}

        <div className="sc-top-scrim" />
        <div className="sc-bot-scrim" />

        {/* Floating Top Bar — padded below native status bar */}
        <div className="sc-top-bar">
          <div className="row gap-8 center-v" style={{ minWidth: 0 }}>
            <button type="button" className="sc-tool-btn" onClick={() => nav(-1)} aria-label={t("storyc_cancel")}>
              <X size={19} />
            </button>
            {sellerCtx && (
              <span className="sc-author-pill ellipsis">{sellerCtx.name}</span>
            )}
          </div>

          <div className="row gap-6 center-v">
            <button
              type="button"
              className="sc-dur-trigger"
              onClick={() => setDurationOpen(true)}
              aria-label={t("storyc_visible_for")}
            >
              <Clock size={14} />
              <span>{durationBadge}</span>
            </button>

            {(previewUrl || createMode) && (
              <>
                <button
                  type="button"
                  className={`sc-tool-btn${textLayer ? " active" : ""}`}
                  onClick={() => setTextOpen(true)}
                  aria-label={t("storyc_caption")}
                >
                  <span className="bold" style={{ fontSize: 14 }}>Aa</span>
                </button>
                <button
                  type="button"
                  className={`sc-tool-btn${stickers.length > 0 ? " active" : ""}`}
                  onClick={() => setStickersOpen(true)}
                  aria-label={t("storyc_stickers")}
                >
                  <span style={{ fontSize: 15, lineHeight: 1 }}>😊</span>
                </button>
                <button
                  type="button"
                  className={`sc-tool-btn${showEffectsTray ? " active" : ""}`}
                  onClick={() => setShowEffectsTray((v) => !v)}
                  aria-label={previewUrl ? t("storyc_filters") : t("storyc_backdrop")}
                >
                  <Sparkles size={16} />
                </button>
                {previewUrl && (
                  <button
                    type="button"
                    className={`sc-tool-btn${fitMode === "contain" ? " active" : ""}`}
                    onClick={() => setFitMode((m) => (m === "cover" ? "contain" : "cover"))}
                    aria-label={fitMode === "cover" ? t("storyc_fit_full") : t("storyc_fit_fill")}
                  >
                    <Repeat size={16} />
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Positioned Text Overlay (drag vertically, tap to edit) */}
        {textLayer && (
          <div
            className={`sc-overlay-text style-${textLayer.style}`}
            style={{
              top: `${textLayer.yPct * 100}%`,
              color: textLayer.style === "pill"
                ? (activeColorMeta.inkOnFill === "dark" ? "var(--ink-900)" : "var(--white)")
                : `var(${activeColorMeta.token})`,
              backgroundColor: textLayer.style === "pill" ? `var(${activeColorMeta.token})` : undefined,
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
              dragState.current = {
                kind: "text",
                startX: e.clientX,
                startY: e.clientY,
                origX: 0.5,
                origY: textLayer.yPct,
                moved: false,
              };
            }}
          >
            {textLayer.text}
          </div>
        )}

        {/* Positioned Stickers (drag anywhere, tap remove) */}
        {stickers.map((st) => (
          <div
            key={st.id}
            className={`sc-sticker kind-${st.kind}`}
            style={{ left: `${st.xPct * 100}%`, top: `${st.yPct * 100}%` }}
            onPointerDown={(e) => {
              e.stopPropagation();
              (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
              dragState.current = {
                kind: "sticker",
                id: st.id,
                startX: e.clientX,
                startY: e.clientY,
                origX: st.xPct,
                origY: st.yPct,
                moved: false,
              };
            }}
          >
            {st.kind === "location" ? (
              <span className="sc-sticker-loc">
                <MapPin size={13} color="var(--brand-600)" /> {st.label}
              </span>
            ) : (
              <span className="sc-sticker-emoji">{st.label}</span>
            )}
            <button
              type="button"
              className="sc-sticker-del"
              aria-label={t("storyc_remove")}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => removeSticker(st.id)}
            >
              <X size={10} weight="bold" />
            </button>
          </div>
        ))}

        {/* Effects Strip (Filters for photo / Gradient swatches for Create mode) */}
        {(previewUrl || createMode) && showEffectsTray && (
          <div className="sc-effects-tray">
            {previewUrl ? (
              <div className="sc-filter-row">
                {STORY_FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className={`sc-filter-chip${filterId === f.id ? " active" : ""}`}
                    onClick={() => setFilterId(f.id)}
                  >
                    {t(f.labelKey)}
                  </button>
                ))}
              </div>
            ) : (
              <div className="sc-filter-row">
                {STORY_BACKDROPS.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    aria-label={b.id}
                    className={`sc-grad-dot${backdropId === b.id ? " active" : ""}`}
                    style={{ background: `linear-gradient(135deg, var(${b.fromToken}), var(${b.toToken}))` }}
                    onClick={() => setBackdropId(b.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Bottom Dock: Audience + Swap photo + Share Story */}
        {(previewUrl || createMode) && (
          <div className="sc-bottom-bar">
            <div className="row gap-6 center-v" style={{ minWidth: 0 }}>
              {sellerCtx ? (
                <span className="sc-aud-pill" title={tf("storyc_seller_note", { name: sellerCtx.name })}>
                  <Globe size={14} />
                  <span className="ellipsis">{t("storyc_everyone")}</span>
                </span>
              ) : (
                <button type="button" className={`sc-aud-pill${closeSelected ? " close" : ""}`} onClick={() => setShowPrivacySheet(true)}>
                  {closeSelected ? <Star size={14} weight="fill" /> : <Globe size={14} />}
                  <span className="ellipsis">
                    {closeSelected
                      ? (allowedUsers.length > 0 ? tf("storyc_close_list", { n: allowedUsers.length }) : t("storyc_close_friends"))
                      : (hiddenUsers.length > 0 ? tf("storyc_hidden_from_n", { n: hiddenUsers.length }) : t("storyc_everyone"))}
                  </span>
                </button>
              )}

              <button
                type="button"
                className="sc-tool-btn"
                onClick={() => galleryRef.current?.click()}
                aria-label={t("storyc_gallery")}
              >
                <Image size={17} />
              </button>
              <button
                type="button"
                className="sc-tool-btn"
                onClick={() => cameraRef.current?.click()}
                aria-label={t("storyc_retake")}
              >
                <Camera size={17} />
              </button>
            </div>

            <button
              type="button"
              className="sc-share-cta"
              disabled={!hasContent || posting}
              onClick={() => void post()}
            >
              <span>{posting ? t("storyc_posting") : t("storyc_share")}</span>
              {!posting && <ArrowRight size={16} weight="bold" />}
            </button>
          </div>
        )}
      </div>

      {durationOpen && (
        <StoryDurationSheet hours={hours} onSelect={setHours} onClose={() => setDurationOpen(false)} />
      )}
      {textOpen && (
        <StoryTextSheet initial={textLayer} onSave={setTextLayer} onClose={() => setTextOpen(false)} />
      )}
      {stickersOpen && (
        <StoryStickersSheet
          locationLabel={locationLabel}
          hasLocationSticker={stickers.some((s) => s.kind === "location")}
          onAdd={addSticker}
          onClose={() => setStickersOpen(false)}
        />
      )}

      {/* Audience options sheet */}
      {showPrivacySheet && (
        <div className="overlay" onClick={closePrivacySheet}>
          <div className="sheet" style={{ maxHeight: "82%", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
            <div className="sheet-grab" />
            <div className="row between align-center" style={{ marginBottom: 14 }}>
              <h2 className="h2" style={{ color: "var(--ink-900)", margin: 0 }}>{t("storyc_audience_title")}</h2>
              <button type="button" className="icon-btn" onClick={closePrivacySheet} aria-label={t("storyc_cancel")}><X size={18} /></button>
            </div>

            <div className="row gap-8" style={{ marginBottom: 16 }}>
              <button
                type="button"
                onClick={() => { setVisibility("everyone"); setSearchQuery(""); setSearchResults([]); }}
                className="row center gap-6 grow sc-seg"
                data-on={visibility === "everyone"}
              >
                <Globe size={15} /> {t("storyc_everyone")}
              </button>
              <button
                type="button"
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
                      <button type="button" key={u.id} onClick={() => toggleUserSelection(u)} className="row between align-center sc-person">
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
                        <button type="button" onClick={() => toggleUserSelection(u)} style={{ background: "none", border: "none", color: "var(--red-500)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
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
                      <button type="button" onClick={() => toggleUserSelection(u)} style={{ background: "none", border: "none", color: "var(--brand-600)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                        {t("storyc_unhide")}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button type="button" onClick={closePrivacySheet} className="btn btn-primary btn-block" style={{ marginTop: 14 }}>{t("storyc_done")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
