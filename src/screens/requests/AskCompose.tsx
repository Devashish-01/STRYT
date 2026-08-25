import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { AppBar } from "@/components/common";
import { Camera, MapPin, IndianRupee, Sparkles, X, Flame, Repeat, EyeOff, Mic, Clock, ChevronDown, SlidersHorizontal, Image, RefreshCw, Users } from "@/components/Icons";
import { FULFILLMENT_LABELS, type FulfillmentType } from "@/types";
import { catalogService, requestService, uploadService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { useApp } from "@/store";
import RadiusSelector from "@/components/RadiusSelector";
import { nativeGeolocation } from "@/lib/nativeGeolocation";
import { loadRequestDraft, saveRequestDraft, clearRequestDraft } from "@/lib/requestDraft";
import { useI18n } from "@/lib/i18n";
import { formatDate } from "@/lib/format";


interface Template {
  label: string;
  emoji: string;
  title: string;
  catSlug: string;
  fields: { key: string; label: string; options?: string[]; placeholder?: string }[];
}

interface TemplateDef {
  labelKey: string;
  emoji: string;
  titleKey: string;
  catSlug: string;
  fields: { key: string; labelKey: string; optionKeys?: string[]; options?: string[]; placeholder?: string }[];
}

const templateDefs: TemplateDef[] = [
  { labelKey: "tpl_birthday_cake_label", emoji: "🎂", titleKey: "tpl_birthday_cake_title", catSlug: "food-beverage", fields: [
    { key: "flavour", labelKey: "field_flavour_label", optionKeys: ["opt_chocolate", "opt_red_velvet", "opt_vanilla", "opt_butterscotch"] },
    { key: "weight", labelKey: "field_weight_label", options: ["0.5 kg", "1 kg", "2 kg"] },
    { key: "eggless", labelKey: "field_eggless_label", optionKeys: ["yes_word", "no_word"] },
  ]},
  { labelKey: "tpl_plumber_label", emoji: "🚰", titleKey: "tpl_plumber_title", catSlug: "home-repair", fields: [
    { key: "issue", labelKey: "field_issue_label", optionKeys: ["opt_leak", "opt_blockage", "opt_fitting", "opt_geyser"] },
    { key: "urgent", labelKey: "field_urgent_today_label", optionKeys: ["yes_word", "no_word"] },
  ]},
  { labelKey: "tpl_ac_service_label", emoji: "❄️", titleKey: "tpl_ac_service_title", catSlug: "home-repair", fields: [
    { key: "type", labelKey: "field_ac_type_label", optionKeys: ["opt_split", "opt_window"] },
    { key: "work", labelKey: "field_work_label", optionKeys: ["opt_service", "opt_gas_refill", "opt_install", "opt_repair"] },
  ]},
  { labelKey: "tpl_daily_tiffin_label", emoji: "🍱", titleKey: "tpl_daily_tiffin_title", catSlug: "food-beverage", fields: [
    { key: "diet", labelKey: "field_diet_label", optionKeys: ["opt_veg", "opt_non_veg", "opt_jain"] },
    { key: "meals", labelKey: "field_meals_label", optionKeys: ["opt_lunch", "opt_dinner", "opt_both"] },
  ]},
];

// ── Date helpers ──────────────────────────────────────────────

function getDateChips(lang: string, t: (key: string) => string): { label: string; sub: string; iso: string; isRelative: boolean }[] {
  const now = new Date();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    // Local YYYY-MM-DD — toISOString() is UTC and shifts the date by a day in
    // negative-UTC zones, mismatching the label shown to the user.
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return {
      label: i === 0 ? t("today_word") : i === 1 ? t("tomorrow_word") : formatDate(iso, lang, { weekday: "short" }),
      sub: formatDate(iso, lang, { day: "numeric", month: "short" }),
      iso,
      isRelative: i === 0 || i === 1,
    };
  });
}

const SLOTS = [
  { key: "morning",   labelKey: "slot_morning",   emoji: "🌅", hours: [6,7,8,9,10,11] },
  { key: "afternoon", labelKey: "slot_afternoon", emoji: "☀️", hours: [12,13,14,15] },
  { key: "evening",   labelKey: "slot_evening",   emoji: "🌆", hours: [16,17,18,19] },
  { key: "night",     labelKey: "slot_night",     emoji: "🌙", hours: [20,21,22,23] },
] as const;

// ─────────────────────────────────────────────────────────────

export default function AskCompose() {
  const nav = useNavigate();
  const { area, user, showToast } = useApp();
  const { t, tf, lang } = useI18n();
  const { data: categories, loading: catLoading, error: catError, refetch: refetchCats } = useQuery(() => catalogService.getCategories(), [], "categories");
  const [draft] = useState(() => loadRequestDraft());
  const templates: Template[] = templateDefs.map((d) => ({
    label: t(d.labelKey),
    emoji: d.emoji,
    title: t(d.titleKey),
    catSlug: d.catSlug,
    fields: d.fields.map((f) => ({
      key: f.key,
      label: t(f.labelKey),
      options: f.optionKeys ? f.optionKeys.map((k) => t(k)) : f.options,
      placeholder: f.placeholder,
    })),
  }));
  const [template, setTemplate] = useState<Template | null>(null);
  const [title, setTitle] = useState(draft?.title ?? "");
  const [desc, setDesc] = useState(draft?.desc ?? "");
  const [cat, setCat] = useState<string | null>(draft?.cat ?? null);
  const [subCat, setSubCat] = useState<string | null>(draft?.subCat ?? null);
  const [fieldVals, setFieldVals] = useState<Record<string, string>>({});
  const [budgetMin, setBudgetMin] = useState(draft?.budgetMin ?? "");
  const [budgetMax, setBudgetMax] = useState(draft?.budgetMax ?? "");
  const [paymentMode, setPaymentMode] = useState<"" | "fixed" | "hourly">(draft?.paymentMode ?? "");
  const [schedDate, setSchedDate] = useState(draft?.schedDate ?? "");
  const [schedSlot, setSchedSlot] = useState(draft?.schedSlot ?? "");
  const [radius, setRadius] = useState(draft?.radius ?? 3);
  const [photos, setPhotos] = useState<string[]>(draft?.photos ?? []);
  const [pendingPreviews, setPendingPreviews] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [urgent, setUrgent] = useState(draft?.urgent ?? false);
  const [recurring, setRecurring] = useState(draft?.recurring ?? false);
  const [anon, setAnon] = useState(draft?.anon ?? false);
  const [expiryHrs, setExpiryHrs] = useState(draft?.expiryHrs ?? 24); // auto-expire window; capped at 24h
  const [showAdvanced, setShowAdvanced] = useState(false); // progressive disclosure of advanced options
  // Group buy — pre-armed when arriving from /bulk's "Start group buy" CTA.
  const [isGroupBuy, setIsGroupBuy] = useState(() => new URLSearchParams(window.location.search).get("groupBuy") === "1");
  const [groupBuyTarget, setGroupBuyTarget] = useState("");
  const [bulkPricePerUnit, setBulkPricePerUnit] = useState("");
  const [fulfillmentType, setFulfillmentType] = useState<FulfillmentType | null>(null);
  const [posting, setPosting] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  function toggleVoice() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) { showToast("Voice not supported in this browser"); return; }

    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const rec = new SpeechRecognition();
    rec.lang = "hi-IN";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    recognitionRef.current = rec;

    rec.onresult = (e: any) => {
      const transcript: string = e.results[0][0].transcript;
      setDesc((d) => (d ? d + " " + transcript : transcript));
      if (!title.trim()) setTitle(transcript.slice(0, 150));
      if ((categories ?? []).length > 0) {
        const lower = transcript.toLowerCase();
        const matched = (categories ?? []).find(
          (c) => lower.includes(c.name.toLowerCase()) || lower.includes((c.slug ?? "").toLowerCase())
        );
        if (matched) { setCat(matched.id); setSubCat(null); }
      }
    };
    rec.onerror = () => { showToast("Voice error. Try again."); setListening(false); };
    rec.onend = () => setListening(false);

    rec.start();
    setListening(true);
  }

  // Build human-readable deadline string for the API
  function buildDeadline(): string {
    const parts: string[] = [];
    if (paymentMode === "hourly") parts.push(t("hourly_word"));
    else if (paymentMode === "fixed") parts.push(t("fixed_price_word"));

    if (schedDate) {
      const chips = getDateChips(lang, t);
      const chip = chips.find((c) => c.iso === schedDate);
      parts.push(chip ? (chip.isRelative ? chip.label : `${chip.label} ${chip.sub}`) : schedDate);
    }
    if (schedSlot) {
      const slot = SLOTS.find((s) => s.key === schedSlot);
      if (slot) parts.push(t(slot.labelKey));
    }

    return parts.join(" · ");
  }

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const remaining = 4 - photos.length - pendingPreviews.length;
    const files = Array.from(e.target.files ?? []).slice(0, Math.max(0, remaining));
    e.target.value = ""; // allow re-picking the same file
    if (files.length === 0) return;
    // Instant local thumbnails so a photo doesn't sit as a bare "…" label for
    // the whole upload round-trip — replaced by the real URLs (or dropped) below.
    const previews = files.map((f) => URL.createObjectURL(f));
    setPendingPreviews((p) => [...p, ...previews]);
    setUploading(true);
    try {
      const urls = await Promise.all(files.map((f) => uploadService.upload(f, "request-photo")));
      setPhotos((p) => [...p, ...urls]);
    } catch (err) {
      showToast(err instanceof Error && err.message ? err.message : "Couldn't upload photo");
    } finally {
      previews.forEach((url) => URL.revokeObjectURL(url));
      setPendingPreviews((p) => p.filter((url) => !previews.includes(url)));
      setUploading(false);
    }
  }

  const budgetInvalid = !!budgetMin && !!budgetMax && Number(budgetMin) > Number(budgetMax);
  const canPost = title.trim().length > 3 && !!cat && !budgetInvalid && !posting && !uploading;
  const missing = !title.trim() ? "title" : !cat ? "category" : budgetInvalid ? "budget" : null;

  // Subcategories are the selected top-level category's children (tree from getCategories).
  const subOptions = (categories ?? []).find((c) => c.id === cat)?.children ?? [];

  function applyTemplate(tpl: Template) {
    setTemplate(tpl);
    setTitle(tpl.title);
    const matched = (categories ?? []).find((c) => c.slug === tpl.catSlug);
    setCat(matched?.id ?? null);
    setSubCat(null);
    setFieldVals({});
  }

  useEffect(() => {
    if (template && (categories ?? []).length > 0 && !cat) {
      const matched = categories!.find((c) => c.slug === template.catSlug);
      if (matched) setCat(matched.id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories]);

  // One-time notice that a restored draft is prefilling the form — silent
  // restore-without-signal would just look like stale/wrong data to the user.
  useEffect(() => {
    if (draft) showToast("Draft restored");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced draft auto-save — a back-button tap or refresh no longer loses
  // a half-written request. Skips empty/untouched forms so it doesn't create
  // a phantom draft before the user's typed anything.
  useEffect(() => {
    if (!title && !desc && !cat) return;
    const timer = setTimeout(() => {
      saveRequestDraft({
        title, desc, cat, subCat, budgetMin, budgetMax, paymentMode,
        schedDate, schedSlot, radius, photos, urgent, recurring, anon, expiryHrs,
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [title, desc, cat, subCat, budgetMin, budgetMax, paymentMode, schedDate, schedSlot, radius, photos, urgent, recurring, anon, expiryHrs]);

  async function post() {
    setPosting(true);
    try {
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
      const selectedCategory = (categories ?? []).find((c) => c.id === cat);
      await requestService.create({
        title,
        description: desc,
        categoryId: cat,
        categoryName: selectedCategory?.name,
        subCategory: subCat ?? undefined,
        budgetMin: budgetMin ? Number(budgetMin) : undefined,
        budgetMax: budgetMax ? Number(budgetMax) : undefined,
        deadline: buildDeadline(),
        radiusKm: radius,
        isUrgent: urgent,
        isRecurring: recurring,
        isAnonymous: anon,
        expiresInHrs: expiryHrs,
        expiresAt: new Date(Date.now() + Math.min(expiryHrs, 24) * 3600 * 1000).toISOString(),
        photos: photos.length ? photos : undefined,
        area,
        lat: lat || 0,
        lng: lng || 0,
        isGroupBuy,
        groupBuyTarget: isGroupBuy && groupBuyTarget ? Number(groupBuyTarget) : undefined,
        bulkPricePerUnit: isGroupBuy && bulkPricePerUnit ? Number(bulkPricePerUnit) : undefined,
        fulfillmentType: isGroupBuy ? fulfillmentType ?? undefined : undefined,
      });
      clearRequestDraft();
      showToast("Request posted! Notifying nearby providers…");
      setTimeout(() => nav("/requests"), 600);
    } catch (e) {
      showToast(e instanceof Error && e.message ? e.message : "Couldn't post. Try again.");
      setPosting(false);
    }
  }

  const budgetLabel = paymentMode === "hourly" ? t("rate_per_hour_label") : t("budget_rupee_label");
  const budgetMinPlaceholder = paymentMode === "hourly" ? t("min_hr_placeholder") : t("min_placeholder");
  const budgetMaxPlaceholder = paymentMode === "hourly" ? t("max_hr_placeholder") : t("max_placeholder");

  return (
    <div className="screen">
      <AppBar title={t("post_a_request")} subtitle={t("ask_compose_subtitle")} />
      <div className="screen-scroll page-pad col gap-16" style={{ paddingBottom: 90 }}>
        <div className="card row gap-10" style={{ padding: "var(--space-sm)", background: "var(--brand-50)", border: "1px solid var(--brand-100)" }}>
          <Sparkles size={20} color="var(--brand-600)" />
          <span className="tiny" style={{ color: "var(--brand-700)", lineHeight: 1.4 }}>
            {t("ask_banner_desc")}
          </span>
        </div>

        {/* Templates */}
        <div className="field">
          <label>{t("quick_start_label")}</label>
          <div className="hscroll" style={{ padding: 0, marginLeft: -2 }}>
            {templates.map((tpl) => (
              <button key={tpl.label} className={`chip ${template?.label === tpl.label ? "active" : ""}`} onClick={() => applyTemplate(tpl)}>
                {tpl.emoji} {tpl.label}
              </button>
            ))}
          </div>
        </div>

        {/* Title — increased limit to 150 */}
        <div className="field">
          <label className="row between">
            <span>{t("what_do_you_need_label")}</span>
            <span className="tiny muted">{title.length}/150</span>
          </label>
          <input
            className="input"
            placeholder={t("ask_title_placeholder")}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={150}
          />
        </div>

        {/* Smart fields from template */}
        {template && template.fields.length > 0 && (
          <div className="card col gap-12" style={{ padding: 14 }}>
            <div className="tiny semi muted">{t("help_responders_quote")}</div>
            {template.fields.map((f) => (
              <div key={f.key} className="field">
                <label style={{ fontSize: 12 }}>{f.label}</label>
                {f.options ? (
                  <div className="row wrap gap-8">
                    {f.options.map((o) => (
                      <button
                        key={o}
                        className={`chip ${fieldVals[f.key] === o ? "active" : ""}`}
                        style={{ padding: "6px 12px", fontSize: 12.5 }}
                        onClick={() => {
                          setFieldVals((v) => ({ ...v, [f.key]: o }));
                          if (f.key === "urgent" && o === t("yes_word")) setUrgent(true);
                        }}
                      >
                        {o}
                      </button>
                    ))}
                  </div>
                ) : (
                  <input className="input" placeholder={f.placeholder} value={fieldVals[f.key] ?? ""} onChange={(e) => setFieldVals((v) => ({ ...v, [f.key]: e.target.value }))} />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Category */}
        <div className="field">
          <label>{t("category_required_label")}</label>
          {catError ? (
            <div className="card col gap-8" style={{ padding: "var(--space-sm)", border: "1px solid var(--red-500)" }}>
              <span className="tiny" style={{ color: "var(--red-600)" }}>
                {tf("couldnt_load_categories", { error: catError.message || t("network_error_word") })}
              </span>
              <button className="btn btn-outline btn-sm" style={{ width: "fit-content" }} onClick={refetchCats}>{t("retry")}</button>
            </div>
          ) : catLoading && (categories ?? []).length === 0 ? (
            <div className="tiny muted">{t("loading_categories")}</div>
          ) : (categories ?? []).length === 0 ? (
            <div className="tiny muted">{t("no_categories_available")} <button className="semi" style={{ color: "var(--brand-700)" }} onClick={refetchCats}>{t("reload_word")}</button></div>
          ) : (
            <div className="row wrap gap-8">
              {(categories ?? []).map((c) => (
                <button key={c.id} className={`chip ${cat === c.id ? "active" : ""}`} onClick={() => { setCat(c.id); setSubCat(null); }}>
                  {c.icon} {c.name.split(" ")[0]}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Subcategory — optional, only when the chosen category has children */}
        {subOptions.length > 0 && (
          <div className="field">
            <label>{t("subcategory_label")} <span className="tiny muted">{t("optional_word")}</span></label>
            <div className="row wrap gap-8">
              {subOptions.map((s) => (
                <button
                  key={s.id}
                  className={`chip ${subCat === s.name ? "active" : ""}`}
                  onClick={() => setSubCat(subCat === s.name ? null : s.name)}
                >
                  {s.icon} {s.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Details */}
        <div className="field">
          <label>{t("details_label")} <span className="tiny muted">{t("optional_word")}</span></label>
          <div style={{ position: "relative" }}>
            <textarea
              className="input"
              style={{ minHeight: 100 }}
              placeholder={t("ask_desc_placeholder")}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              maxLength={500}
            />
            <button
              className="icon-btn"
              style={{ position: "absolute", bottom: 8, right: 8, background: listening ? "var(--red-100)" : "var(--brand-50)", color: listening ? "var(--red-600)" : "var(--brand-700)" }}
              onClick={toggleVoice}
            >
              <Mic size={18} />
            </button>
          </div>
          {desc.length > 400 && (
            <span className="tiny muted" style={{ textAlign: "right" }}>{desc.length}/500</span>
          )}
        </div>

        {/* Photos — real device upload to Supabase Storage */}
        <div className="field">
          <label>{t("photos_label")} <span className="tiny muted">{t("optional_word")}</span></label>
          <div className="row gap-8 wrap">
            {photos.map((url, i) => (
              <div key={url} style={{ position: "relative" }}>
                <img src={url} alt={tf("attached_photo_alt", { n: i + 1 })} className="thumb" style={{ width: 76, height: 76, borderRadius: 12 }} />
                <button className="icon-btn" aria-label={t("remove_photo_label")} style={{ position: "absolute", top: -8, right: -8, width: 24, height: 24, background: "var(--red-500)", color: "#fff" }} onClick={() => setPhotos((p) => p.filter((_, x) => x !== i))}>
                  <X size={14} />
                </button>
              </div>
            ))}
            {pendingPreviews.map((url) => (
              <div key={url} style={{ position: "relative", width: 76, height: 76 }}>
                <img src={url} alt={t("uploading_photo_alt")} className="thumb" style={{ width: 76, height: 76, borderRadius: 12, opacity: 0.5 }} />
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <RefreshCw size={18} color="#fff" className="spin" />
                </div>
              </div>
            ))}
            {photos.length + pendingPreviews.length < 4 && (
              <>
                <button
                  className="col center"
                  style={{ width: 76, height: 76, borderRadius: 12, border: "2px dashed var(--ink-300)", color: "var(--ink-500)", gap: 2, opacity: uploading ? 0.6 : 1 }}
                  onClick={() => cameraRef.current?.click()}
                  disabled={uploading}
                >
                  <Camera size={20} />
                  <span className="tiny">{t("camera_word")}</span>
                </button>
                <button
                  className="col center"
                  style={{ width: 76, height: 76, borderRadius: 12, border: "2px dashed var(--ink-300)", color: "var(--ink-500)", gap: 2, opacity: uploading ? 0.6 : 1 }}
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                >
                  <Image size={20} />
                  <span className="tiny">{t("gallery_word")}</span>
                </button>
              </>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={handleFiles} />
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={handleFiles} />
        </div>

        {/* ── Payment mode + budget ── */}
        <div className="field">
          <label>{t("payment_type_label")}</label>
          <div className="row gap-10" style={{ marginBottom: 12 }}>
            <button
              className={`chip grow center ${paymentMode === "fixed" ? "active" : ""}`}
              style={{ gap: 6 }}
              onClick={() => setPaymentMode(paymentMode === "fixed" ? "" : "fixed")}
            >
              <IndianRupee size={14} /> {t("full_amount_word")}
            </button>
            <button
              className={`chip grow center ${paymentMode === "hourly" ? "active" : ""}`}
              style={{ gap: 6 }}
              onClick={() => setPaymentMode(paymentMode === "hourly" ? "" : "hourly")}
            >
              <Clock size={14} /> {t("hourly_rate_word")}
            </button>
          </div>

          <label>{budgetLabel} <span className="tiny muted">{t("optional_word")}</span></label>
          <div className="row gap-10">
            <div className="row grow" style={{ border: "1.5px solid var(--ink-200)", borderRadius: "var(--radius-sm)", padding: "0 10px", background: "#fff" }}>
              <IndianRupee size={16} color="var(--ink-400)" />
              <input className="input" style={{ border: "none" }} inputMode="numeric" placeholder={budgetMinPlaceholder} value={budgetMin} onChange={(e) => setBudgetMin(e.target.value.replace(/\D/g, ""))} />
            </div>
            <div className="row grow" style={{ border: "1.5px solid var(--ink-200)", borderRadius: "var(--radius-sm)", padding: "0 10px", background: "#fff" }}>
              <IndianRupee size={16} color="var(--ink-400)" />
              <input className="input" style={{ border: "none" }} inputMode="numeric" placeholder={budgetMaxPlaceholder} value={budgetMax} onChange={(e) => setBudgetMax(e.target.value.replace(/\D/g, ""))} />
            </div>
          </div>
        </div>

        {/* Group buy — sits ABOVE "more options" rather than inside it: it
            changes what the post fundamentally is (a pool others join, not a
            one-off ask), so it shouldn't be buried behind a disclosure. */}
        <button
          type="button"
          className="row gap-12"
          onClick={() => setIsGroupBuy((v) => !v)}
          style={{ width: "100%", padding: 14, borderRadius: 12, textAlign: "left", background: isGroupBuy ? "var(--brand-50)" : "var(--ink-50)", border: isGroupBuy ? "2px solid var(--brand-600)" : "1px solid var(--ink-200)", alignItems: "center" }}
        >
          <Users size={20} color={isGroupBuy ? "var(--brand-700)" : "var(--ink-500)"} />
          <span className="col grow" style={{ gap: 2 }}>
            <span className="semi small" style={{ color: "var(--ink-800)" }}>{t("make_group_buy_label")}</span>
            <span className="tiny muted">{t("neighbours_pool_desc")}</span>
          </span>
          <span style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0, border: isGroupBuy ? "none" : "2px solid var(--ink-300)", background: isGroupBuy ? "var(--brand-600)" : "transparent", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>
            {isGroupBuy ? "✓" : ""}
          </span>
        </button>

        {isGroupBuy && (
          <div className="col gap-14" style={{ padding: 14, borderRadius: 12, background: "var(--brand-50)", border: "1px solid var(--brand-200)" }}>
            <div className="row gap-10">
              <div className="grow">
                <label className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>{t("target_quantity_label")}</label>
                <input
                  className="input"
                  inputMode="numeric"
                  placeholder={t("eg_100_placeholder")}
                  value={groupBuyTarget}
                  onChange={(e) => setGroupBuyTarget(e.target.value.replace(/[^0-9]/g, ""))}
                />
              </div>
              <div className="grow">
                <label className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>{t("target_price_per_unit_label")}</label>
                <input
                  className="input"
                  inputMode="decimal"
                  placeholder={t("eg_499_placeholder")}
                  value={bulkPricePerUnit}
                  onChange={(e) => setBulkPricePerUnit(e.target.value.replace(/[^0-9.]/g, ""))}
                />
              </div>
            </div>
            <div>
              <label className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>{t("how_fulfilled_label")}</label>
              <div className="row gap-8" style={{ flexWrap: "wrap" }}>
                {(Object.keys(FULFILLMENT_LABELS) as FulfillmentType[]).map((ft) => (
                  <button
                    key={ft}
                    type="button"
                    className="chip"
                    style={fulfillmentType === ft ? { background: "var(--brand-100)", color: "var(--brand-700)", border: "1.5px solid var(--brand-300)" } : undefined}
                    onClick={() => setFulfillmentType(fulfillmentType === ft ? null : ft)}
                  >
                    {FULFILLMENT_LABELS[ft]}
                  </button>
                ))}
              </div>
            </div>
            <div className="tiny muted" style={{ lineHeight: 1.5 }}>
              {t("providers_quote_privately_desc")}
            </div>
          </div>
        )}

        {/* Advanced options — collapsed by default so the core stays simple.
            Defaults (24h expiry, default radius, no scheduling/toggles) are
            sensible, so most people can just post without opening this. */}
        <button
          type="button"
          className="row between"
          onClick={() => setShowAdvanced((v) => !v)}
          style={{ width: "100%", padding: "12px 14px", borderRadius: 12, background: "var(--ink-50)", border: "1px solid var(--ink-200)", alignItems: "center" }}
        >
          <span className="semi small row gap-8" style={{ alignItems: "center", color: "var(--ink-800)" }}>
            <SlidersHorizontal size={16} color="var(--brand-600)" /> {t("more_options_label")}
            <span className="tiny muted" style={{ fontWeight: 400 }}>{t("options_subtitle_hint")}</span>
          </span>
          <ChevronDown size={18} color="var(--ink-500)" style={{ transform: showAdvanced ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
        </button>

        {showAdvanced && (
        <>
        {/* ── When do you need it ── */}
        <div className="field">
          <label>{t("when_need_it_label")} <span className="tiny muted">{t("optional_word")}</span></label>

          {/* Date strip */}
          <div className="hscroll" style={{ padding: "0 0 4px", marginLeft: -2 }}>
            {getDateChips(lang, t).map((chip) => (
              <button
                key={chip.iso}
                onClick={() => setSchedDate(schedDate === chip.iso ? "" : chip.iso)}
                className={`chip col center ${schedDate === chip.iso ? "active" : ""}`}
                style={{ gap: 1, padding: "8px 14px", minWidth: 64 }}
              >
                <span style={{ fontSize: 12, fontWeight: 700 }}>{chip.label}</span>
                <span style={{ fontSize: 10, opacity: 0.75, fontWeight: 500 }}>{chip.sub}</span>
              </button>
            ))}
          </div>

          {/* Time slot */}
          <div className="row gap-8 wrap" style={{ marginTop: 10 }}>
            {SLOTS.map((s) => (
              <button
                key={s.key}
                className={`chip ${schedSlot === s.key ? "active" : ""}`}
                style={{ gap: 5 }}
                onClick={() => setSchedSlot(schedSlot === s.key ? "" : s.key)}
              >
                {s.emoji} {t(s.labelKey)}
              </button>
            ))}
          </div>

          {/* Preview */}
          {buildDeadline() && (
            <div className="row gap-8" style={{ marginTop: 10, padding: "9px 12px", background: "var(--brand-50)", borderRadius: "var(--radius-sm)", border: "1px solid var(--brand-100)" }}>
              <Clock size={14} color="var(--brand-600)" />
              <span className="tiny semi" style={{ color: "var(--brand-700)" }}>{buildDeadline()}</span>
            </div>
          )}
        </div>

        {/* Toggles */}
        <div className="col gap-8">
          <ToggleRow icon={<Flame size={18} color="var(--red-500)" />} label={t("mark_urgent_label")} hint={t("pushes_providers_faster_hint")} on={urgent} set={setUrgent} />
          <ToggleRow icon={<Repeat size={18} color="var(--blue-500)" />} label={t("recurring_need_label")} hint={t("recurring_need_hint")} on={recurring} set={setRecurring} />
          <ToggleRow icon={<EyeOff size={18} color="var(--brand-600)" />} label={t("post_anonymously_label")} hint={t("name_hidden_hint")} on={anon} set={setAnon} />
        </div>

        {/* Auto-expiry timer — capped at 24h so stale requests self-close */}
        <div className="field">
          <label className="row gap-8" style={{ alignItems: "center", marginBottom: 8 }}>
            <Clock size={16} color="var(--brand-600)" />
            <span className="semi small">{t("auto_expire_after_label")}</span>
          </label>
          <div className="row gap-8" style={{ flexWrap: "wrap" }}>
            {[3, 6, 12, 24].map((h) => (
              <button
                key={h}
                type="button"
                className="chip"
                style={{
                  flex: 1,
                  minWidth: 64,
                  background: expiryHrs === h ? "var(--brand-600)" : "#fff",
                  color: expiryHrs === h ? "#fff" : "var(--ink-700)",
                  borderColor: expiryHrs === h ? "var(--brand-600)" : "var(--ink-200)",
                  fontWeight: expiryHrs === h ? 700 : 500,
                }}
                onClick={() => setExpiryHrs(h)}
              >
                {h}h
              </button>
            ))}
          </div>
          <span className="tiny muted" style={{ marginTop: 6, display: "block" }}>
            {expiryHrs > 1 ? tf("providers_stop_seeing_after_other", { h: expiryHrs }) : tf("providers_stop_seeing_after_one", { h: expiryHrs })}
          </span>
        </div>

        <div className="field">
          <RadiusSelector
            value={radius}
            onChange={setRadius}
            accentColor="var(--brand-600)"
            label={t("visible_within_label")}
            description={tf("visible_within_desc", { area })}
          />
        </div>
        </>
        )}
      </div>

      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid var(--line)", padding: "8px 12px 12px" }}>
        {missing && (
          <p className="tiny muted" style={{ textAlign: "center", marginBottom: 6 }}>
            {missing === "title" ? t("add_title_continue")
              : missing === "category" ? t("select_category_continue")
              : t("max_budget_more_than_min")}
          </p>
        )}
        <button
          className="btn btn-primary btn-block"
          disabled={!canPost}
          onClick={() => void post()}
        >
          {posting ? t("posting") : t("post_request_btn")}
        </button>
      </div>
    </div>
  );
}

function ToggleRow({ icon, label, hint, on, set }: { icon: React.ReactNode; label: string; hint: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <button className="card row gap-12" style={{ padding: "var(--space-sm)", textAlign: "left", border: on ? "1.5px solid var(--brand-400)" : "1px solid var(--line)" }} onClick={() => set(!on)}>
      {icon}
      <div className="grow">
        <div className="semi small">{label}</div>
        <div className="tiny muted">{hint}</div>
      </div>
      <span style={{ width: 44, height: 26, borderRadius: 999, background: on ? "var(--brand-600)" : "var(--ink-200)", position: "relative", flexShrink: 0 }}>
        <span style={{ position: "absolute", top: 3, left: on ? 21 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
      </span>
    </button>
  );
}
