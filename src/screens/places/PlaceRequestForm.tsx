import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppBar } from "@/components/common";
import { Camera, Mountains, Trophy, Binoculars, MapPin, ChevronDown } from "@/components/Icons";
import { placesService, uploadService } from "@/services";
import { useApp } from "@/store";
import LocationPicker from "@/components/LocationPicker";
import type { PlaceCategory, PlaceDifficulty } from "@/types";
import { useI18n } from "@/lib/i18n";

const CATEGORIES: { id: PlaceCategory; label: string; icon: typeof Mountains }[] = [
  { id: "MOUNTAIN", label: "Mountain", icon: Mountains },
  { id: "TREK", label: "Trek", icon: Binoculars },
  { id: "SPORTS_VENUE", label: "Sports venue", icon: Trophy },
  { id: "TOURIST_SPOT", label: "Tourist spot", icon: MapPin },
  { id: "OTHER", label: "Other", icon: Mountains },
];

const DIFFICULTIES: { id: PlaceDifficulty; label: string }[] = [
  { id: "EASY", label: "Easy" },
  { id: "MODERATE", label: "Moderate" },
  { id: "HARD", label: "Challenging" },
];

interface PlaceRequestFormProps {
  /** "request" (default) submits PENDING for admin review — the customer
   *  flow. "admin-create" inserts ACTIVE directly, which RLS only allows
   *  when the caller is actually an admin. Same form, same fields either way. */
  mode?: "request" | "admin-create";
  /** When rendered inline (e.g. inside the admin queue) instead of as its
   *  own routed screen, skip the AppBar/full-screen chrome. */
  embedded?: boolean;
  onDone?: () => void;
  onClose?: () => void;
}

export default function PlaceRequestForm({ mode = "request", embedded = false, onDone, onClose }: PlaceRequestFormProps) {
  const nav = useNavigate();
  const { user, showToast } = useApp();
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<PlaceCategory>("MOUNTAIN");
  const [description, setDescription] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [lat, setLat] = useState<number | null>(user.lat || null);
  const [lng, setLng] = useState<number | null>(user.lng || null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [bestTimeToVisit, setBestTimeToVisit] = useState("");
  const [entryFee, setEntryFee] = useState("");
  const [openingHours, setOpeningHours] = useState("");
  const [visitDuration, setVisitDuration] = useState("");
  const [difficulty, setDifficulty] = useState<PlaceDifficulty | null>(null);
  const [howToReach, setHowToReach] = useState("");
  const [parkingInfo, setParkingInfo] = useState("");
  const [distanceFromCityKm, setDistanceFromCityKm] = useState("");
  const [safetyTips, setSafetyTips] = useState("");
  const [weatherNote, setWeatherNote] = useState("");

  function close() {
    if (onClose) onClose();
    else nav(-1);
  }

  async function submit() {
    if (!name.trim()) { showToast(t("prf_name_first")); return; }
    if (lat == null || lng == null) { showToast(t("prf_drop_pin")); return; }
    setSubmitting(true);
    try {
      let coverImage: string | undefined;
      if (photo) coverImage = await uploadService.upload(photo, "place-photo");

      const distanceNum = parseFloat(distanceFromCityKm);
      // The submitter's own city, so the place can be filtered and labelled by city later — it used to be left out
      // entirely (P4). Reverse geocoding the pin would be better; this is what we already know for certain.
      const payload = {
        name: name.trim(),
        category,
        description: description.trim() || null,
        addressLine1: addressLine1.trim() || null,
        city: (user.city || user.area || "").trim() || null,
        lat,
        lng,
        coverImage: coverImage ?? null,
        bestTimeToVisit: bestTimeToVisit.trim() || null,
        entryFee: entryFee.trim() || null,
        openingHours: openingHours.trim() || null,
        visitDuration: visitDuration.trim() || null,
        difficulty,
        howToReach: howToReach.trim() || null,
        parkingInfo: parkingInfo.trim() || null,
        distanceFromCityKm: Number.isFinite(distanceNum) ? distanceNum : null,
        safetyTips: safetyTips.trim() || null,
        weatherNote: weatherNote.trim() || null,
      };

      if (mode === "admin-create") await placesService.createAsAdmin(payload);
      else await placesService.request(payload);

      showToast(mode === "admin-create" ? "Place added ✓" : "Submitted for review — we'll let you know once it's live");
      if (onDone) onDone();
      else nav(-1);
    } catch (e: any) {
      showToast(e?.message || "Couldn't submit — try again");
    } finally {
      setSubmitting(false);
    }
  }

  const form = (
    <div className="col gap-16">
      <div>
        <label htmlFor="placerequestform-name" className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>{t("prf_name")}</label>
        <input id="placerequestform-name" className="input" placeholder={t("prf_name_placeholder")} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
      </div>

      <div>
        <label className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>{t("category")}</label>
        <div className="row gap-8" style={{ flexWrap: "wrap" }}>
          {CATEGORIES.map((c) => {
            const Icon = c.icon;
            const active = category === c.id;
            return (
              <button
                key={c.id}
                className="chip row gap-6 center-v"
                style={active ? { background: "var(--brand-100)", color: "var(--brand-700)", border: "1.5px solid var(--brand-300)" } : undefined}
                onClick={() => setCategory(c.id)}
              >
                <Icon size={14} /> {c.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label htmlFor="placerequestform-description-optional" className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>{t("prf_description")}</label>
        <textarea id="placerequestform-description-optional"
          className="input"
          style={{ minHeight: 80, resize: "vertical" }}
          placeholder={t("prf_description_placeholder")}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={1000}
        />
      </div>

      <div>
        <label htmlFor="placerequestform-address-optional" className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>{t("prf_address")}</label>
        <input id="placerequestform-address-optional" className="input" placeholder={t("prf_address_placeholder")} value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} maxLength={200} />
      </div>

      <div>
        <label className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>{t("prf_location_label")}</label>
        <LocationPicker lat={lat} lng={lng} storedLat={user.lat} storedLng={user.lng} onChange={(la, ln) => { setLat(la); setLng(ln); }} height={160} />
      </div>

      <div>
        <label className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>{t("prf_photo")}</label>
        {photoPreview ? (
          <div style={{ position: "relative", width: 120, height: 90 }}>
            <img src={photoPreview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 10 }} />
            <button className="icon-btn" style={{ position: "absolute", top: -8, right: -8, width: 26, height: 26, background: "var(--surface)", boxShadow: "var(--shadow-sm)" }} onClick={() => { setPhoto(null); setPhotoPreview(null); }}>×</button>
          </div>
        ) : (
          <label className="row gap-8 center-v" style={{ width: "fit-content", padding: "10px 14px", borderRadius: 12, border: "1.5px dashed var(--ink-300)", cursor: "pointer" }}>
            <Camera size={16} /> <span className="tiny semi">{t("prf_add_photo")}</span>
            <input
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setPhoto(f);
                setPhotoPreview(URL.createObjectURL(f));
              }}
            />
          </label>
        )}
      </div>

      <div>
        <button
          className="row gap-6 center-v"
          style={{ background: "none", border: "none", padding: 0, color: "var(--brand-700)" }}
          onClick={() => setShowMore((v) => !v)}
        >
          <span className="tiny semi">{t("prf_more_details")}</span>
          <ChevronDown size={14} style={{ transform: showMore ? "rotate(180deg)" : undefined, transition: "transform .15s" }} />
        </button>

        {showMore && (
          <div className="col gap-14" style={{ marginTop: 12 }}>
            <div className="row gap-10">
              <div className="grow">
                <label htmlFor="placerequestform-best-time-to-visit" className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>{t("prf_best_time")}</label>
                <input id="placerequestform-best-time-to-visit" className="input" placeholder={t("prf_best_time_placeholder")} value={bestTimeToVisit} onChange={(e) => setBestTimeToVisit(e.target.value)} maxLength={150} />
              </div>
              <div className="grow">
                <label htmlFor="placerequestform-entry-fee" className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>{t("prf_entry_fee")}</label>
                <input id="placerequestform-entry-fee" className="input" placeholder={t("prf_entry_fee_placeholder")} value={entryFee} onChange={(e) => setEntryFee(e.target.value)} maxLength={100} />
              </div>
            </div>

            <div className="row gap-10">
              <div className="grow">
                <label htmlFor="placerequestform-hours" className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>{t("prf_hours")}</label>
                <input id="placerequestform-hours" className="input" placeholder={t("prf_hours_placeholder")} value={openingHours} onChange={(e) => setOpeningHours(e.target.value)} maxLength={100} />
              </div>
              <div className="grow">
                <label htmlFor="placerequestform-typical-visit-length" className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>{t("prf_visit_length")}</label>
                <input id="placerequestform-typical-visit-length" className="input" placeholder={t("prf_visit_length_placeholder")} value={visitDuration} onChange={(e) => setVisitDuration(e.target.value)} maxLength={100} />
              </div>
            </div>

            <div>
              <label className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>{t("prf_difficulty")}</label>
              <div className="row gap-8">
                {DIFFICULTIES.map((d) => (
                  <button
                    key={d.id}
                    className="chip"
                    style={difficulty === d.id ? { background: "var(--brand-100)", color: "var(--brand-700)", border: "1.5px solid var(--brand-300)" } : undefined}
                    onClick={() => setDifficulty(difficulty === d.id ? null : d.id)}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="placerequestform-how-to-reach" className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>{t("prf_how_to_reach")}</label>
              <input id="placerequestform-how-to-reach" className="input" placeholder={t("prf_how_to_reach_placeholder")} value={howToReach} onChange={(e) => setHowToReach(e.target.value)} maxLength={300} />
            </div>

            <div className="row gap-10">
              <div className="grow">
                <label htmlFor="placerequestform-parking" className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>{t("prf_parking")}</label>
                <input id="placerequestform-parking" className="input" placeholder={t("prf_parking_placeholder")} value={parkingInfo} onChange={(e) => setParkingInfo(e.target.value)} maxLength={150} />
              </div>
              <div style={{ width: 120 }}>
                <label htmlFor="placerequestform-distance-km" className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>{t("prf_distance")}</label>
                <input id="placerequestform-distance-km" className="input" inputMode="decimal" placeholder="35" value={distanceFromCityKm} onChange={(e) => setDistanceFromCityKm(e.target.value.replace(/[^0-9.]/g, ""))} />
              </div>
            </div>

            <div>
              <label htmlFor="placerequestform-safety-tips" className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>{t("prf_safety_tips")}</label>
              <textarea id="placerequestform-safety-tips"
                className="input"
                style={{ minHeight: 60, resize: "vertical" }}
                placeholder={t("prf_safety_placeholder")}
                value={safetyTips}
                onChange={(e) => setSafetyTips(e.target.value)}
                maxLength={500}
              />
            </div>

            <div>
              <label htmlFor="placerequestform-weather-note" className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>{t("prf_weather_note")}</label>
              <input id="placerequestform-weather-note" className="input" placeholder={t("prf_weather_placeholder")} value={weatherNote} onChange={(e) => setWeatherNote(e.target.value)} maxLength={200} />
            </div>
          </div>
        )}
      </div>

      <button className="btn btn-primary btn-block" style={{ height: 48, fontSize: 15, fontWeight: 700 }} disabled={submitting} onClick={submit}>
        {submitting ? "Submitting…" : mode === "admin-create" ? "Add place" : "Submit for review"}
      </button>
    </div>
  );

  if (embedded) {
    return <div className="card" style={{ padding: 16, marginTop: 12 }}>{form}</div>;
  }

  return (
    <div className="screen">
      <AppBar title={mode === "admin-create" ? "Add a place" : "Suggest a place"} onBack={close} />
      <div className="screen-scroll page-pad">{form}</div>
    </div>
  );
}
