import { useState } from "react";
import { useParams } from "react-router-dom";
import { AppBar, SafeImg, EmptyState } from "@/components/common";
import { Mountains, Trophy, Binoculars, MapPin, Navigation, Clock, Ticket, CalendarCheck, Phone, AlertCircle, Info, CloudRain, Sun, CloudFog } from "@/components/Icons";
import { discoveryService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { Skeleton, ErrorView } from "@/components/states";
import PhotoViewer from "@/components/PhotoViewer";
import { useApp } from "@/store";
import { useWeather } from "@/features/ambient/useWeather";
import type { PlaceCategory } from "@/types";

// WMO weather codes (open-meteo's `current.weather_code`) collapsed into a
// short label — same standard the ambient header's rain/hot flags already
// read off of, just turned into text here instead of a visual effect.
function weatherLabel(code: number): string {
  if (code === 0) return "Clear sky";
  if (code <= 3) return "Partly cloudy";
  if (code === 45 || code === 48) return "Foggy";
  if (code >= 51 && code <= 57) return "Light drizzle";
  if (code >= 61 && code <= 67) return "Rainy";
  if (code >= 71 && code <= 77) return "Snowy";
  if (code >= 80 && code <= 82) return "Rain showers";
  if (code >= 95) return "Thunderstorm";
  return "—";
}

const CATEGORY_META: Record<PlaceCategory, { label: string; icon: typeof Mountains }> = {
  MOUNTAIN: { label: "Mountain", icon: Mountains },
  TREK: { label: "Trek", icon: Binoculars },
  SPORTS_VENUE: { label: "Sports venue", icon: Trophy },
  TOURIST_SPOT: { label: "Tourist spot", icon: MapPin },
  OTHER: { label: "Place", icon: Mountains },
};

const DIFFICULTY_LABEL: Record<string, string> = {
  EASY: "Easy",
  MODERATE: "Moderate",
  HARD: "Challenging",
};

// Fixed, verified national emergency numbers — never per-place data. A wrong
// "nearest police station" number entered or scraped for something people
// might call in a real emergency is worse than showing nothing; these three
// are correct anywhere in India and never go stale.
const EMERGENCY_NUMBERS = [
  { label: "All-in-one emergency", number: "112" },
  { label: "Police", number: "100" },
  { label: "Women's helpline", number: "1091" },
];

function InfoRow({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <div className="row gap-10" style={{ alignItems: "flex-start" }}>
      <Icon size={16} color="var(--brand-600)" style={{ flexShrink: 0, marginTop: 1 }} />
      <div>
        <div className="tiny muted">{label}</div>
        <div className="small semi" style={{ marginTop: 1 }}>{value}</div>
      </div>
    </div>
  );
}

export default function PlaceDetail() {
  const { id = "" } = useParams();
  const { user } = useApp();
  const { data: place, loading, error, refetch } = useQuery(() => discoveryService.getPlace(id), [id], `place:${id}`);
  const [viewingPhoto, setViewingPhoto] = useState<number | null>(null);
  // Called unconditionally (before any early return) per Rules of Hooks —
  // useWeather itself already no-ops until place.lat/lng are real numbers.
  const weather = useWeather(place?.lat ?? undefined, place?.lng ?? undefined);

  if (loading && !place) {
    return (
      <div className="screen">
        <AppBar title="Place" />
        <div className="page-pad"><Skeleton h={220} /><Skeleton h={20} mb={8} /><Skeleton h={16} /></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="screen">
        <AppBar title="Place" />
        <ErrorView error={error} onRetry={refetch} />
      </div>
    );
  }

  if (!place) {
    return (
      <div className="screen">
        <AppBar title="Place" />
        <EmptyState emoji="🗺️" title="Place not found" text="This place may have been removed." />
      </div>
    );
  }

  const meta = CATEGORY_META[place.category] ?? CATEGORY_META.OTHER;
  const Icon = meta.icon;
  const photos = [place.coverImage, ...(place.gallery ?? [])].filter((u): u is string => !!u);

  return (
    <div className="screen">
      <AppBar title={place.name} />
      <div className="screen-scroll">
        {photos.length > 0 ? (
          <div className="hscroll" style={{ padding: "0 0 4px" }}>
            {photos.map((url, i) => (
              <SafeImg
                key={i}
                src={url}
                className="thumb"
                style={{ width: photos.length === 1 ? "100%" : 260, height: 220, borderRadius: 0, flexShrink: 0, cursor: "pointer" }}
                onClick={() => setViewingPhoto(i)}
              />
            ))}
          </div>
        ) : (
          <div style={{ width: "100%", height: 180, background: "var(--brand-50)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon size={48} color="var(--brand-300)" />
          </div>
        )}

        <div className="page-pad col gap-14">
          <div>
            <div className="row gap-8 center-v">
              <span className="badge" style={{ background: "var(--brand-100)", color: "var(--brand-700)" }}>
                <Icon size={12} /> {meta.label}
              </span>
            </div>
            <div className="bold" style={{ fontSize: 20, marginTop: 8 }}>{place.name}</div>
            {(place.addressLine1 || place.city) && (
              <div className="row gap-6 center-v tiny muted" style={{ marginTop: 4 }}>
                <MapPin size={13} /> {[place.addressLine1, place.city].filter(Boolean).join(", ")}
              </div>
            )}
          </div>

          {weather && (() => {
            const WeatherIcon = weather.isRaining ? CloudRain : weather.code <= 3 && weather.code > 0 ? CloudFog : Sun;
            return (
              <div className="card row gap-10 center-v" style={{ padding: 12 }}>
                <WeatherIcon size={22} color={weather.isRaining ? "var(--blue-500)" : "var(--amber-500)"} />
                <div>
                  <div className="semi small">{Math.round(weather.tempC)}°C — {weatherLabel(weather.code)}</div>
                  <div className="tiny muted">Right now at this location</div>
                </div>
              </div>
            );
          })()}

          {place.description && (
            <div className="small" style={{ lineHeight: 1.6, color: "var(--ink-700)" }}>{place.description}</div>
          )}

          {place.weatherNote && (
            <div className="card row gap-10" style={{ padding: 12, background: "var(--amber-50)", border: "1px solid var(--amber-200)" }}>
              <Info size={16} color="var(--amber-700)" style={{ flexShrink: 0, marginTop: 1 }} />
              <div className="tiny" style={{ color: "var(--amber-800)", lineHeight: 1.5 }}>{place.weatherNote}</div>
            </div>
          )}

          {(place.bestTimeToVisit || place.entryFee || place.openingHours || place.visitDuration || place.difficulty) && (
            <div className="card col gap-12" style={{ padding: 14 }}>
              <div className="tiny semi muted">Plan your visit</div>
              {place.bestTimeToVisit && <InfoRow icon={CalendarCheck} label="Best time to visit" value={place.bestTimeToVisit} />}
              {place.entryFee && <InfoRow icon={Ticket} label="Entry fee" value={place.entryFee} />}
              {place.openingHours && <InfoRow icon={Clock} label="Hours" value={place.openingHours} />}
              {place.visitDuration && <InfoRow icon={Clock} label="Typical visit length" value={place.visitDuration} />}
              {place.difficulty && <InfoRow icon={Mountains} label="Difficulty" value={DIFFICULTY_LABEL[place.difficulty] ?? place.difficulty} />}
            </div>
          )}

          {(place.howToReach || place.parkingInfo || place.distanceFromCityKm != null) && (
            <div className="card col gap-12" style={{ padding: 14 }}>
              <div className="tiny semi muted">Getting there</div>
              {place.distanceFromCityKm != null && (
                <InfoRow icon={Navigation} label="Distance from Indore" value={`${place.distanceFromCityKm} km`} />
              )}
              {place.howToReach && <InfoRow icon={Navigation} label="How to reach" value={place.howToReach} />}
              {place.parkingInfo && <InfoRow icon={Info} label="Parking" value={place.parkingInfo} />}
            </div>
          )}

          <div className="card col gap-12" style={{ padding: 14 }}>
            <div className="tiny semi muted">Safety</div>
            {place.safetyTips && (
              <div className="row gap-8" style={{ padding: 10, background: "var(--red-50)", borderRadius: 10, alignItems: "flex-start" }}>
                <AlertCircle size={16} color="var(--red-600)" style={{ flexShrink: 0, marginTop: 1 }} />
                <div className="tiny" style={{ color: "var(--red-700)", lineHeight: 1.5 }}>{place.safetyTips}</div>
              </div>
            )}
            <div className="col gap-6">
              {EMERGENCY_NUMBERS.map((e) => (
                <a
                  key={e.number}
                  href={`tel:${e.number}`}
                  className="row between center-v"
                  style={{ padding: "8px 10px", borderRadius: 10, background: "var(--ink-50)", textDecoration: "none" }}
                >
                  <span className="row gap-8 center-v tiny semi" style={{ color: "var(--ink-800)" }}>
                    <Phone size={14} color="var(--green-600)" /> {e.label}
                  </span>
                  <span className="semi small" style={{ color: "var(--brand-700)" }}>{e.number}</span>
                </a>
              ))}
            </div>
          </div>

          {place.lat != null && place.lng != null && (
            <button
              className="btn btn-primary row gap-8 center"
              onClick={() => {
                const origin = user.lat && user.lng ? `${user.lat},${user.lng}` : "";
                window.open(`https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${place.lat},${place.lng}&travelmode=driving`, "_blank");
              }}
            >
              <Navigation size={16} /> Get Directions
            </button>
          )}
        </div>
      </div>

      {viewingPhoto !== null && (
        <PhotoViewer
          photos={photos.map((url) => ({ url }))}
          startIndex={viewingPhoto}
          onClose={() => setViewingPhoto(null)}
        />
      )}
    </div>
  );
}
