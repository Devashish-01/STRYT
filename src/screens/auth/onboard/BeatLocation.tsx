import { useRef, useState } from "react";
import { MapPin, Navigation, Loader, Check } from "@/components/Icons";
import { useI18n } from "@/lib/i18n";
import { nativeGeolocation } from "@/lib/nativeGeolocation";
import { reverseGeocode, forwardGeocode, type GeoPlace } from "@/lib/geocode";
import { discoveryService } from "@/services";
import { BeatFrame } from "./BeatFrame";

export interface PickedPlace {
  lat: number;
  lng: number;
  area: string;
}

/**
 * Beat 3 — "Where's your street?"
 *
 * This absorbs the old standalone LocationPermission screen. Before, location
 * was an optional field here AND a whole screen immediately afterwards, so a
 * user who filled it in was asked again and one who skipped was nagged.
 *
 * The permission ask is also where the flow has to earn the rest of itself, so
 * a granted fix does not just tick a box: it reverse-geocodes to a real area
 * name and counts what's actually nearby ("37 places near Marathahalli"). That
 * number is the whole argument for finishing — and unlike a marketing claim,
 * it's read from the same discovery query Home will run a moment later.
 */
export function BeatLocation({
  busy,
  onDone,
  onSkip,
}: {
  busy?: boolean;
  onDone: (place: PickedPlace) => void;
  onSkip: () => void;
}) {
  const { t, tf } = useI18n();
  const [locating, setLocating] = useState(false);
  const [denied, setDenied] = useState(false);
  const [place, setPlace] = useState<PickedPlace | null>(null);
  const [nearby, setNearby] = useState<{ count: number; more: boolean } | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeoPlace[]>([]);
  // Bumped by whichever of GPS or search-select the user acts on most
  // recently, so a slow GPS fix can't land after a manual pick and silently
  // overwrite it — settle() only applies if its token is still current when
  // the async work finishes.
  const settleToken = useRef(0);

  /** The payoff line. Best-effort: a failed count still lets them continue.
   *  The feed is paginated, so a full first page means "at least this many" —
   *  shown as "20+" rather than a flat 20, which would undersell a busy area.
   *  Guarded by `token`: if a newer settle() has started since this count was
   *  kicked off, its result is stale and must not land on top of the newer one. */
  async function countNearby(lat: number, lng: number, token: number) {
    try {
      const page = await discoveryService.businesses({ lat, lng, sort: "nearby" });
      if (token !== settleToken.current) return;
      setNearby({ count: page.data.length, more: page.page.has_more });
    } catch {
      if (token !== settleToken.current) return;
      setNearby(null);
    }
  }

  /** Commits a resolved place — but only if `token` is still the most recent
   *  request. GPS and a manual search pick both resolve asynchronously and
   *  either can be slower than the other; without this a leisurely GPS fix
   *  could land after the user had already picked a place from search and
   *  silently overwrite their deliberate choice. Whichever the user acts on
   *  LAST wins, regardless of which one RESOLVES last. */
  async function settle(lat: number, lng: number, area: string, token: number) {
    if (token !== settleToken.current) return;
    setPlace({ lat, lng, area });
    await countNearby(lat, lng, token);
  }

  // Not `useGps` — the `use` prefix makes eslint's rules-of-hooks treat a
  // plain function as a hook, and it is called from an onClick.
  function requestGps() {
    setLocating(true);
    setDenied(false);
    const token = ++settleToken.current;
    nativeGeolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        // A failed reverse-geocode is cosmetic: feeds run off lat/lng, so keep
        // the fix and show a neutral label rather than discarding a good one.
        const area = (await reverseGeocode(latitude, longitude).catch(() => null)) ?? "";
        await settle(latitude, longitude, area, token);
        setLocating(false);
      },
      () => {
        setLocating(false);
        setDenied(true);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  async function search(q: string) {
    setQuery(q);
    if (q.trim().length < 2) { setResults([]); return; }
    try {
      setResults(await forwardGeocode(q));
    } catch {
      setResults([]);
    }
  }

  const found = place !== null;

  return (
    <BeatFrame
      title={t("ob_beat3_title")}
      sub={t("ob_beat3_sub")}
      ctaLabel={found ? t("ob_continue") : locating ? t("ob_beat3_locating") : t("ob_beat3_allow")}
      ctaDisabled={locating}
      ctaBusy={busy}
      onCta={() => (found ? onDone(place) : requestGps())}
      // Hidden once a place is found — skipping a question you've already
      // answered doesn't mean anything, and sits right under Continue where
      // it could be tapped by habit instead.
      onSkip={found ? undefined : onSkip}
    >
      {found ? (
        <div className="ob-found">
          <span className="ob-found-tick"><Check size={18} /></span>
          <div>
            <div className="ob-found-area">{place.area || t("ob_beat3_title")}</div>
            <div className="ob-found-count">
              {nearby === null
                ? ""
                : nearby.count > 0
                ? tf("ob_beat3_nearby", {
                    count: nearby.more ? `${nearby.count}+` : nearby.count,
                    area: place.area || "you",
                  })
                : t("ob_beat3_nearby_none")}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="ob-locating-orb" aria-hidden="true">
            {locating ? <Loader className="spin" size={30} /> : <Navigation size={30} />}
          </div>
          {denied && <div className="ob-hint bad">{t("ob_beat3_denied")}</div>}

          <div className="ob-label" style={{ marginTop: 18 }}>{t("ob_beat3_search")}</div>
          <div className="ob-search-field">
            <MapPin size={16} className="ob-search-icon" />
            <input
              className="input ob-search-input"
              value={query}
              onChange={(e) => void search(e.target.value)}
              placeholder={t("neighborhood_placeholder")}
              aria-label={t("ob_beat3_search")}
            />
          </div>
          {results.length > 0 && (
            <div className="ob-results">
              {results.map((p, i) => (
                <button
                  key={`${p.lat},${p.lng},${i}`}
                  type="button"
                  className="ob-result"
                  onClick={() => { setResults([]); setQuery(""); void settle(p.lat, p.lng, p.area, ++settleToken.current); }}
                >
                  <MapPin size={14} /> <span>{p.area}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </BeatFrame>
  );
}
