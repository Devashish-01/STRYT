import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppBar } from "@/components/common";
import { Camera, Mountains, Trophy, Binoculars, MapPin, ChevronDown } from "@/components/Icons";
import { placesService, uploadService } from "@/services";
import { useApp } from "@/store";
import LocationPicker from "@/components/LocationPicker";
import type { PlaceCategory, PlaceDifficulty } from "@/types";

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
    if (!name.trim()) { showToast("Give it a name first"); return; }
    if (lat == null || lng == null) { showToast("Drop a pin for the location"); return; }
    setSubmitting(true);
    try {
      let coverImage: string | undefined;
      if (photo) coverImage = await uploadService.upload(photo, "place-photo");

      const distanceNum = parseFloat(distanceFromCityKm);
      const payload = {
        name: name.trim(),
        category,
        description: description.trim() || null,
        addressLine1: addressLine1.trim() || null,
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
        <label className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>Name</label>
        <input className="input" placeholder="e.g. Sunset Point, Panchgani" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
      </div>

      <div>
        <label className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>Category</label>
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
        <label className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>Description (optional)</label>
        <textarea
          className="input"
          style={{ minHeight: 80, resize: "vertical" }}
          placeholder="What makes this place worth visiting?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={1000}
        />
      </div>

      <div>
        <label className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>Address (optional)</label>
        <input className="input" placeholder="Nearest landmark or road" value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} maxLength={200} />
      </div>

      <div>
        <label className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>Location — tap the map to drop a pin</label>
        <LocationPicker lat={lat} lng={lng} storedLat={user.lat} storedLng={user.lng} onChange={(la, ln) => { setLat(la); setLng(ln); }} height={160} />
      </div>

      <div>
        <label className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>Photo (optional)</label>
        {photoPreview ? (
          <div style={{ position: "relative", width: 120, height: 90 }}>
            <img src={photoPreview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 10 }} />
            <button className="icon-btn" style={{ position: "absolute", top: -8, right: -8, width: 26, height: 26, background: "#fff", boxShadow: "var(--shadow-sm)" }} onClick={() => { setPhoto(null); setPhotoPreview(null); }}>×</button>
          </div>
        ) : (
          <label className="row gap-8 center-v" style={{ width: "fit-content", padding: "10px 14px", borderRadius: 12, border: "1.5px dashed var(--ink-300)", cursor: "pointer" }}>
            <Camera size={16} /> <span className="tiny semi">Add a photo</span>
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
          <span className="tiny semi">More details (optional)</span>
          <ChevronDown size={14} style={{ transform: showMore ? "rotate(180deg)" : undefined, transition: "transform .15s" }} />
        </button>

        {showMore && (
          <div className="col gap-14" style={{ marginTop: 12 }}>
            <div className="row gap-10">
              <div className="grow">
                <label className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>Best time to visit</label>
                <input className="input" placeholder="e.g. Oct-Feb, early morning" value={bestTimeToVisit} onChange={(e) => setBestTimeToVisit(e.target.value)} maxLength={150} />
              </div>
              <div className="grow">
                <label className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>Entry fee</label>
                <input className="input" placeholder="Free, or ₹20 per person" value={entryFee} onChange={(e) => setEntryFee(e.target.value)} maxLength={100} />
              </div>
            </div>

            <div className="row gap-10">
              <div className="grow">
                <label className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>Hours</label>
                <input className="input" placeholder="e.g. 6 AM - 7 PM" value={openingHours} onChange={(e) => setOpeningHours(e.target.value)} maxLength={100} />
              </div>
              <div className="grow">
                <label className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>Typical visit length</label>
                <input className="input" placeholder="e.g. 1-2 hours" value={visitDuration} onChange={(e) => setVisitDuration(e.target.value)} maxLength={100} />
              </div>
            </div>

            <div>
              <label className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>Difficulty (treks/mountains)</label>
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
              <label className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>How to reach</label>
              <input className="input" placeholder="e.g. Own vehicle recommended, last 2km unpaved" value={howToReach} onChange={(e) => setHowToReach(e.target.value)} maxLength={300} />
            </div>

            <div className="row gap-10">
              <div className="grow">
                <label className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>Parking</label>
                <input className="input" placeholder="e.g. Free parking near entrance" value={parkingInfo} onChange={(e) => setParkingInfo(e.target.value)} maxLength={150} />
              </div>
              <div style={{ width: 120 }}>
                <label className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>Distance (km)</label>
                <input className="input" inputMode="decimal" placeholder="35" value={distanceFromCityKm} onChange={(e) => setDistanceFromCityKm(e.target.value.replace(/[^0-9.]/g, ""))} />
              </div>
            </div>

            <div>
              <label className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>Safety tips</label>
              <textarea
                className="input"
                style={{ minHeight: 60, resize: "vertical" }}
                placeholder="Real precautions — e.g. avoid swimming near the falls during monsoon"
                value={safetyTips}
                onChange={(e) => setSafetyTips(e.target.value)}
                maxLength={500}
              />
            </div>

            <div>
              <label className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>Weather note</label>
              <input className="input" placeholder="e.g. Dries up outside monsoon season" value={weatherNote} onChange={(e) => setWeatherNote(e.target.value)} maxLength={200} />
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
