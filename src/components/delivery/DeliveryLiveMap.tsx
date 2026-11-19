import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { RASTER_TILES } from "@/lib/mapTiles";
import { useI18n } from "@/lib/i18n";
import { Navigation, Target, Plus, Minus } from "@/components/Icons";

export interface DeliveryLiveMapProps {
  riderLat?: number | null;
  riderLng?: number | null;
  riderHeading?: number | null;
  riderName?: string | null;
  storeLat?: number | null;
  storeLng?: number | null;
  storeName?: string | null;
  destLat?: number | null;
  destLng?: number | null;
  destAddress?: string | null;
  status?: string | null;
  etaMinutes?: number | null;
  className?: string;
  style?: React.CSSProperties;
  interactive?: boolean;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function DeliveryLiveMap({
  riderLat,
  riderLng,
  riderHeading = 0,
  riderName,
  storeLat,
  storeLng,
  storeName,
  destLat,
  destLng,
  destAddress,
  status = "EN_ROUTE",
  etaMinutes,
  className = "",
  style,
  interactive = true,
}: DeliveryLiveMapProps) {
  const { t } = useI18n();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const riderMarkerRef = useRef<L.Marker | null>(null);
  const storeMarkerRef = useRef<L.Marker | null>(null);
  const destMarkerRef = useRef<L.Marker | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);
  const userPannedRef = useRef(false);

  const [distanceText, setDistanceText] = useState<string | null>(null);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const initialLat = riderLat ?? destLat ?? storeLat ?? 18.5204;
    const initialLng = riderLng ?? destLng ?? storeLng ?? 73.8567;

    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      attributionControl: false,
      dragging: interactive,
      touchZoom: interactive,
      scrollWheelZoom: interactive,
      doubleClickZoom: interactive,
    }).setView([initialLat, initialLng], 14);

    L.tileLayer(RASTER_TILES.url, {
      attribution: RASTER_TILES.attribution,
      maxZoom: RASTER_TILES.maxZoom,
      tileSize: RASTER_TILES.tileSize,
      zoomOffset: RASTER_TILES.zoomOffset,
    }).addTo(map);

    map.on("dragstart", () => {
      userPannedRef.current = true;
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [interactive]); // eslint-disable-line react-hooks/exhaustive-deps

  // Store Pin Marker
  useEffect(() => {
    if (!mapRef.current || storeLat == null || storeLng == null) return;

    const storeIcon = L.divIcon({
      html: `
        <div style="display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:50%;background:var(--surface);border:2.5px solid var(--brand-600);box-shadow:0 3px 10px rgba(0,0,0,0.22);font-size:16px;">
          🏬
        </div>
      `,
      className: "",
      iconSize: [34, 34],
      iconAnchor: [17, 17],
    });

    if (storeMarkerRef.current) {
      storeMarkerRef.current.setLatLng([storeLat, storeLng]);
    } else {
      storeMarkerRef.current = L.marker([storeLat, storeLng], { icon: storeIcon }).addTo(mapRef.current);
      if (storeName) {
        storeMarkerRef.current.bindTooltip(storeName, { direction: "top", offset: [0, -18], permanent: false });
      }
    }
  }, [storeLat, storeLng, storeName]);

  // Destination / Customer Pin Marker
  useEffect(() => {
    if (!mapRef.current || destLat == null || destLng == null) return;

    const destIcon = L.divIcon({
      html: `
        <div style="display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:50%;background:var(--red-500);border:2.5px solid #ffffff;box-shadow:0 3px 10px rgba(0,0,0,0.25);font-size:17px;color:#ffffff;">
          🏠
        </div>
      `,
      className: "",
      iconSize: [34, 34],
      iconAnchor: [17, 17],
    });

    if (destMarkerRef.current) {
      destMarkerRef.current.setLatLng([destLat, destLng]);
    } else {
      destMarkerRef.current = L.marker([destLat, destLng], { icon: destIcon }).addTo(mapRef.current);
      if (destAddress) {
        destMarkerRef.current.bindTooltip(t("dlv_trk_dest_tooltip") || "Your Doorstep", { direction: "top", offset: [0, -18], permanent: false });
      }
    }
  }, [destLat, destLng, destAddress, t]);

  // Rider Marker & Heading Rotation
  useEffect(() => {
    if (!mapRef.current) return;

    if (riderLat == null || riderLng == null) {
      if (riderMarkerRef.current) {
        riderMarkerRef.current.remove();
        riderMarkerRef.current = null;
      }
      return;
    }

    const heading = typeof riderHeading === "number" && !Number.isNaN(riderHeading) ? riderHeading : 0;
    const riderHtml = `
      <div style="position:relative;width:44px;height:44px;display:flex;align-items:center;justify-content:center;">
        <div style="position:absolute;width:44px;height:44px;border-radius:50%;background:color-mix(in srgb, var(--brand-500) 25%, transparent);animation:dlv-radar-pulse 2s cubic-bezier(0,0,0.2,1) infinite;"></div>
        <div style="position:relative;z-index:2;width:36px;height:36px;border-radius:50%;background:var(--brand-600);border:3px solid #ffffff;box-shadow:0 4px 12px rgba(0,0,0,0.28);display:flex;align-items:center;justify-content:center;transition:transform 0.4s ease-out;transform:rotate(${heading}deg);">
          <span style="font-size:18px;line-height:1;display:inline-block;transform:rotate(-${heading}deg);">🛵</span>
        </div>
      </div>
    `;

    const riderIcon = L.divIcon({
      html: riderHtml,
      className: "",
      iconSize: [44, 44],
      iconAnchor: [22, 22],
    });

    if (riderMarkerRef.current) {
      riderMarkerRef.current.setLatLng([riderLat, riderLng]);
      riderMarkerRef.current.setIcon(riderIcon);
    } else {
      riderMarkerRef.current = L.marker([riderLat, riderLng], { icon: riderIcon, zIndexOffset: 1000 }).addTo(mapRef.current);
      if (riderName) {
        riderMarkerRef.current.bindTooltip(riderName, { direction: "top", offset: [0, -22], permanent: true });
      }
    }

    // Distance calculation to customer destination
    if (destLat != null && destLng != null) {
      const km = haversineKm(riderLat, riderLng, destLat, destLng);
      if (km < 0.15) {
        setDistanceText(t("trk_eta_now") || "Arriving now");
      } else if (km < 1) {
        setDistanceText(`${Math.round(km * 1000)} m`);
      } else {
        setDistanceText(`${km.toFixed(1)} km`);
      }
    }
  }, [riderLat, riderLng, riderHeading, riderName, destLat, destLng, t]);

  // Route Polyline
  useEffect(() => {
    if (!mapRef.current) return;

    const points: [number, number][] = [];
    if (storeLat != null && storeLng != null && (riderLat == null || status === "ASSIGNED")) {
      points.push([storeLat, storeLng]);
    }
    if (riderLat != null && riderLng != null) {
      points.push([riderLat, riderLng]);
    }
    if (destLat != null && destLng != null) {
      points.push([destLat, destLng]);
    }

    if (points.length < 2) {
      if (polylineRef.current) {
        polylineRef.current.remove();
        polylineRef.current = null;
      }
      return;
    }

    if (polylineRef.current) {
      polylineRef.current.setLatLngs(points);
    } else {
      polylineRef.current = L.polyline(points, {
        color: "var(--brand-600)",
        weight: 4,
        dashArray: "6, 8",
        opacity: 0.85,
        lineCap: "round",
        lineJoin: "round",
      }).addTo(mapRef.current);
    }
  }, [riderLat, riderLng, storeLat, storeLng, destLat, destLng, status]);

  // Auto-fit viewport bounds
  const fitBounds = useCallback(() => {
    if (!mapRef.current) return;
    const bounds = L.latLngBounds([]);

    if (riderLat != null && riderLng != null) bounds.extend([riderLat, riderLng]);
    if (destLat != null && destLng != null) bounds.extend([destLat, destLng]);
    if (storeLat != null && storeLng != null && (riderLat == null || bounds.isValid() === false)) {
      bounds.extend([storeLat, storeLng]);
    }

    if (bounds.isValid()) {
      mapRef.current.fitBounds(bounds, { padding: [45, 45], maxZoom: 16 });
      userPannedRef.current = false;
    }
  }, [riderLat, riderLng, destLat, destLng, storeLat, storeLng]);

  useEffect(() => {
    if (!userPannedRef.current) {
      fitBounds();
    }
  }, [fitBounds]);

  const handleZoomIn = () => mapRef.current?.zoomIn();
  const handleZoomOut = () => mapRef.current?.zoomOut();

  return (
    <div
      className={`relative w-full h-full overflow-hidden select-none ${className}`}
      style={{ minHeight: 220, background: "var(--surface-muted)", ...style }}
    >
      <style>{`
        @keyframes dlv-radar-pulse {
          0% { transform: scale(0.85); opacity: 0.9; }
          100% { transform: scale(1.8); opacity: 0; }
        }
      `}</style>

      {/* Map canvas */}
      <div ref={mapContainerRef} className="w-full h-full" style={{ zIndex: 1 }} />

      {/* Top Floating ETA & Distance Pill */}
      {(distanceText || etaMinutes != null) && (
        <div
          className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2 px-3.5 py-1.5 rounded-full shadow-lg border border-[var(--line)] backdrop-blur-md"
          style={{ background: "color-mix(in srgb, var(--surface) 90%, transparent)" }}
        >
          <span className="text-base" aria-hidden="true">🛵</span>
          <span className="text-xs font-bold text-[var(--ink-800)]">
            {etaMinutes != null ? `${etaMinutes} min away` : status === "ARRIVED" ? (t("dlv_pub_arrived") || "Arrived") : (t("dlv_pub_on_way") || "On the way")}
          </span>
          {distanceText && (
            <>
              <span className="w-1 h-1 rounded-full bg-[var(--ink-300)]" />
              <span className="text-xs font-medium text-[var(--ink-500)]">{distanceText}</span>
            </>
          )}
        </div>
      )}

      {/* Map Control Buttons */}
      {interactive && (
        <div className="absolute right-3 bottom-3 z-[1000] flex flex-col gap-1.5">
          <button
            type="button"
            onClick={fitBounds}
            className="w-9 h-9 rounded-xl flex items-center justify-center bg-[var(--surface)] text-[var(--ink-700)] shadow-md border border-[var(--line)] hover:bg-[var(--surface-muted)] active:scale-95 transition-transform"
            title="Recenter tracking view"
            aria-label="Recenter tracking view"
          >
            <Target size={17} />
          </button>
          <div className="flex flex-col rounded-xl overflow-hidden shadow-md border border-[var(--line)] bg-[var(--surface)]">
            <button
              type="button"
              onClick={handleZoomIn}
              className="w-9 h-8 flex items-center justify-center text-[var(--ink-700)] hover:bg-[var(--surface-muted)] active:scale-95 transition-transform border-b border-[var(--line)]"
              title="Zoom in"
              aria-label="Zoom in"
            >
              <Plus size={16} />
            </button>
            <button
              type="button"
              onClick={handleZoomOut}
              className="w-9 h-8 flex items-center justify-center text-[var(--ink-700)] hover:bg-[var(--surface-muted)] active:scale-95 transition-transform"
              title="Zoom out"
              aria-label="Zoom out"
            >
              <Minus size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
