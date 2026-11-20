import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { RASTER_TILES } from "@/lib/mapTiles";
import { useI18n } from "@/lib/i18n";
import { Target, Plus, Minus } from "@/components/Icons";
import { getRoadRoute, type RoadRoute } from "@/lib/geo/routing";
import { useMarkerInterpolation } from "./useMarkerInterpolation";

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
  bottomSheetOffsetPx?: number;
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
  bottomSheetOffsetPx = 180,
}: DeliveryLiveMapProps) {
  const { t } = useI18n();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const riderMarkerRef = useRef<L.Marker | null>(null);
  const storeMarkerRef = useRef<L.Marker | null>(null);
  const destMarkerRef = useRef<L.Marker | null>(null);
  const destCircleRef = useRef<L.Circle | null>(null);
  const polylineCasingRef = useRef<L.Polyline | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);
  const userPannedRef = useRef(false);

  // Smooth 60 FPS marker interpolation for rider coordinates & heading
  const animatedRider = useMarkerInterpolation(riderLat, riderLng, riderHeading, 2200);

  const [roadRoute, setRoadRoute] = useState<RoadRoute | null>(null);
  const [distanceText, setDistanceText] = useState<string | null>(null);
  const [liveDurationMin, setLiveDurationMin] = useState<number | null>(null);

  // 1. Initialize Leaflet Map
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
    }).setView([initialLat, initialLng], 15);

    const tileLayer = L.tileLayer(RASTER_TILES.url, {
      attribution: RASTER_TILES.attribution,
      maxZoom: RASTER_TILES.maxZoom,
      tileSize: RASTER_TILES.tileSize,
      zoomOffset: RASTER_TILES.zoomOffset,
      className: "delivery-map-tiles",
    }).addTo(map);

    map.on("dragstart", () => {
      userPannedRef.current = true;
    });

    mapRef.current = map;

    // Invalidate size once container layout stabilizes (modals, CSS transitions)
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 120);

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    if (mapContainerRef.current) {
      resizeObserver.observe(mapContainerRef.current);
    }

    return () => {
      clearTimeout(timer);
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, [interactive]); // eslint-disable-line react-hooks/exhaustive-deps

  // 2. Fetch Turn-by-Turn Road Route (Mapbox Directions API with OSRM fallback)
  const routeOrigin = useMemo(() => {
    if (riderLat != null && riderLng != null) return { lat: riderLat, lng: riderLng };
    if (storeLat != null && storeLng != null) return { lat: storeLat, lng: storeLng };
    return null;
  }, [riderLat, riderLng, storeLat, storeLng]);

  const routeDestination = useMemo(() => {
    if (destLat != null && destLng != null) return { lat: destLat, lng: destLng };
    return null;
  }, [destLat, destLng]);

  useEffect(() => {
    if (!routeOrigin || !routeDestination) {
      setRoadRoute(null);
      return;
    }

    const abortController = new AbortController();
    let isCancelled = false;

    void (async () => {
      try {
        const route = await getRoadRoute(routeOrigin, routeDestination, abortController.signal);
        if (!isCancelled) {
          setRoadRoute(route);
          const km = route.distanceMeters / 1000;
          if (km < 0.15) {
            setDistanceText(t("trk_eta_now") || "Arriving now");
          } else if (km < 1) {
            setDistanceText(`${Math.round(route.distanceMeters)} m`);
          } else {
            setDistanceText(`${km.toFixed(1)} km`);
          }
          const min = Math.max(1, Math.round(route.durationSeconds / 60));
          setLiveDurationMin(min);
        }
      } catch {
        // Handled silently
      }
    })();

    return () => {
      isCancelled = true;
      abortController.abort();
    };
  }, [routeOrigin, routeDestination, t]);

  // 3. Store Marker (Pickup location)
  useEffect(() => {
    if (!mapRef.current || storeLat == null || storeLng == null) return;

    const safeStoreName = storeName || "Store";
    const storeIcon = L.divIcon({
      html: `
        <div style="position:relative;display:flex;flex-direction:column;align-items:center;cursor:pointer;">
          <div style="display:flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:12px;background:#ffffff;border:2.5px solid var(--brand-600);box-shadow:0 4px 14px rgba(0,0,0,0.22);font-size:20px;">
            🏬
          </div>
          <div style="margin-top:3px;white-space:nowrap;background:rgba(15,23,42,0.88);color:#ffffff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:6px;box-shadow:0 2px 6px rgba(0,0,0,0.25);pointer-events:none;">
            ${safeStoreName}
          </div>
        </div>
      `,
      className: "",
      iconSize: [40, 62],
      iconAnchor: [20, 20],
    });

    if (storeMarkerRef.current) {
      storeMarkerRef.current.setLatLng([storeLat, storeLng]);
      storeMarkerRef.current.setIcon(storeIcon);
    } else {
      storeMarkerRef.current = L.marker([storeLat, storeLng], { icon: storeIcon, zIndexOffset: 900 }).addTo(mapRef.current);
    }
  }, [storeLat, storeLng, storeName]);

  // 4. Customer Destination Marker & Doorstep Zone Ring
  useEffect(() => {
    if (!mapRef.current || destLat == null || destLng == null) return;

    const destLabel = t("dlv_trk_dest_tooltip") || "Doorstep";
    const destIcon = L.divIcon({
      html: `
        <div style="position:relative;display:flex;flex-direction:column;align-items:center;cursor:pointer;">
          <div style="display:flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:50%;background:var(--red-500);border:3px solid #ffffff;box-shadow:0 4px 14px rgba(0,0,0,0.28);font-size:18px;color:#ffffff;">
            🏠
          </div>
          <div style="margin-top:3px;white-space:nowrap;background:var(--red-600);color:#ffffff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:6px;box-shadow:0 2px 6px rgba(0,0,0,0.25);pointer-events:none;">
            ${destLabel}
          </div>
        </div>
      `,
      className: "",
      iconSize: [38, 60],
      iconAnchor: [19, 19],
    });

    if (destMarkerRef.current) {
      destMarkerRef.current.setLatLng([destLat, destLng]);
      destMarkerRef.current.setIcon(destIcon);
    } else {
      destMarkerRef.current = L.marker([destLat, destLng], { icon: destIcon, zIndexOffset: 950 }).addTo(mapRef.current);
    }

    // Doorstep arrival zone (35 meter radius ring)
    if (destCircleRef.current) {
      destCircleRef.current.setLatLng([destLat, destLng]);
    } else {
      destCircleRef.current = L.circle([destLat, destLng], {
        radius: 35,
        color: "var(--red-500)",
        weight: 1.5,
        opacity: 0.65,
        fillColor: "var(--red-500)",
        fillOpacity: 0.08,
        dashArray: "4, 6",
      }).addTo(mapRef.current);
    }
  }, [destLat, destLng, destAddress, t]);

  // 5. Rider Vehicle Marker with Headlight Beam Cone & Dynamic Bearing
  useEffect(() => {
    if (!mapRef.current) return;

    if (animatedRider.lat == null || animatedRider.lng == null) {
      if (riderMarkerRef.current) {
        riderMarkerRef.current.remove();
        riderMarkerRef.current = null;
      }
      return;
    }

    const heading = animatedRider.heading || 0;

    // Headlight cone & pulse ripple (Zepto/Zomato style)
    const riderHtml = `
      <div style="position:relative;width:60px;height:60px;display:flex;align-items:center;justify-content:center;pointer-events:none;">
        <!-- Forward Headlight Beam Cone -->
        <div style="position:absolute;top:50%;left:50%;width:0;height:0;border-left:18px solid transparent;border-right:18px solid transparent;border-top:42px solid rgba(234, 88, 12, 0.38);transform-origin:50% 0%;transform:translate(-50%, -100%) rotate(${heading}deg);filter:blur(2px);pointer-events:none;"></div>

        <!-- Radar Pulse Circle -->
        <div style="position:absolute;width:52px;height:52px;border-radius:50%;background:rgba(234, 88, 12, 0.22);animation:dlv-radar-pulse 2s cubic-bezier(0,0,0.2,1) infinite;"></div>

        <!-- Rider Scooter Vehicle Icon -->
        <div style="position:relative;z-index:3;width:40px;height:40px;border-radius:50%;background:#ea580c;border:3px solid #ffffff;box-shadow:0 4px 16px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;transform:rotate(${heading}deg);transition:transform 0.25s linear;">
          <span style="font-size:20px;line-height:1;display:inline-block;transform:rotate(-${heading}deg);">🛵</span>
        </div>

        <!-- Rider Name Badge -->
        ${riderName ? `
          <div style="position:absolute;top:-22px;white-space:nowrap;background:rgba(15,23,42,0.88);color:#ffffff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;box-shadow:0 2px 6px rgba(0,0,0,0.25);z-index:4;">
            ${riderName}
          </div>
        ` : ""}
      </div>
    `;

    const riderIcon = L.divIcon({
      html: riderHtml,
      className: "",
      iconSize: [60, 60],
      iconAnchor: [30, 30],
    });

    if (riderMarkerRef.current) {
      riderMarkerRef.current.setLatLng([animatedRider.lat, animatedRider.lng]);
      riderMarkerRef.current.setIcon(riderIcon);
    } else {
      riderMarkerRef.current = L.marker([animatedRider.lat, animatedRider.lng], {
        icon: riderIcon,
        zIndexOffset: 1200,
      }).addTo(mapRef.current);
    }
  }, [animatedRider.lat, animatedRider.lng, animatedRider.heading, riderName]);

  // 6. Snapped Road Polyline Rendering
  useEffect(() => {
    if (!mapRef.current) return;

    let points: [number, number][] = [];

    if (roadRoute && roadRoute.coordinates.length > 1) {
      // Connect interpolated rider position to remaining road coordinates
      if (animatedRider.lat != null && animatedRider.lng != null) {
        // Find closest point on road route
        let closestIdx = 0;
        let minD = Infinity;
        for (let i = 0; i < roadRoute.coordinates.length; i++) {
          const pt = roadRoute.coordinates[i];
          const d = (pt[0] - animatedRider.lat) ** 2 + (pt[1] - animatedRider.lng) ** 2;
          if (d < minD) {
            minD = d;
            closestIdx = i;
          }
        }
        points = [[animatedRider.lat, animatedRider.lng], ...roadRoute.coordinates.slice(closestIdx + 1)];
      } else {
        points = roadRoute.coordinates;
      }
    } else {
      // Euclidean fallback
      if (storeLat != null && storeLng != null && (animatedRider.lat == null || status === "ASSIGNED")) {
        points.push([storeLat, storeLng]);
      }
      if (animatedRider.lat != null && animatedRider.lng != null) {
        points.push([animatedRider.lat, animatedRider.lng]);
      }
      if (destLat != null && destLng != null) {
        points.push([destLat, destLng]);
      }
    }

    if (points.length < 2) {
      if (polylineRef.current) {
        polylineRef.current.remove();
        polylineRef.current = null;
      }
      if (polylineCasingRef.current) {
        polylineCasingRef.current.remove();
        polylineCasingRef.current = null;
      }
      return;
    }

    // Casing line (soft dark shadow for contrast)
    if (polylineCasingRef.current) {
      polylineCasingRef.current.setLatLngs(points);
    } else {
      polylineCasingRef.current = L.polyline(points, {
        color: "#0f172a",
        weight: 8,
        opacity: 0.22,
        lineCap: "round",
        lineJoin: "round",
      }).addTo(mapRef.current);
    }

    // Foreground Route Line (vibrant delivery orange)
    if (polylineRef.current) {
      polylineRef.current.setLatLngs(points);
    } else {
      polylineRef.current = L.polyline(points, {
        color: "#ea580c",
        weight: 4.5,
        opacity: 0.95,
        lineCap: "round",
        lineJoin: "round",
      }).addTo(mapRef.current);
    }
  }, [roadRoute, animatedRider.lat, animatedRider.lng, storeLat, storeLng, destLat, destLng, status]);

  // 7. Auto-fit bounds with smart bottom sheet padding
  const fitBounds = useCallback(() => {
    if (!mapRef.current) return;
    const bounds = L.latLngBounds([]);

    const curRiderLat = riderLat;
    const curRiderLng = riderLng;

    if (curRiderLat != null && curRiderLng != null) bounds.extend([curRiderLat, curRiderLng]);
    if (destLat != null && destLng != null) bounds.extend([destLat, destLng]);
    if (storeLat != null && storeLng != null && (curRiderLat == null || bounds.isValid() === false)) {
      bounds.extend([storeLat, storeLng]);
    }

    if (bounds.isValid()) {
      mapRef.current.fitBounds(bounds, {
        paddingTopLeft: [40, 40],
        paddingBottomRight: [40, bottomSheetOffsetPx + 40],
        maxZoom: 16,
      });
    }
  }, [riderLat, riderLng, destLat, destLng, storeLat, storeLng, bottomSheetOffsetPx]);

  const initialFitDone = useRef(false);
  useEffect(() => {
    if (!userPannedRef.current && (!initialFitDone.current || riderLat != null)) {
      fitBounds();
      initialFitDone.current = true;
    }
  }, [fitBounds, riderLat]);

  const handleRecenter = () => {
    userPannedRef.current = false;
    fitBounds();
  };

  const handleZoomIn = () => mapRef.current?.zoomIn();
  const handleZoomOut = () => mapRef.current?.zoomOut();

  // Effective ETA text
  const displayEta = useMemo(() => {
    if (status === "ARRIVED") return t("dlv_pub_arrived") || "Arrived outside your door";
    if (status === "DELIVERED") return t("dlv_pub_done") || "Delivered";
    if (etaMinutes != null) return `${etaMinutes} min away`;
    if (liveDurationMin != null) return `~${liveDurationMin} min away`;
    return t("dlv_pub_on_way") || "On the way";
  }, [status, etaMinutes, liveDurationMin, t]);

  return (
    <div
      className={`relative w-full h-full overflow-hidden select-none ${className}`}
      style={{ minHeight: 220, background: "var(--surface-muted)", ...style }}
    >
      <style>{`
        .delivery-map-tiles {
          filter: saturate(1.12) contrast(1.02);
        }
        @keyframes dlv-radar-pulse {
          0% { transform: scale(0.85); opacity: 0.9; }
          100% { transform: scale(2.0); opacity: 0; }
        }
      `}</style>

      {/* Map Canvas */}
      <div ref={mapContainerRef} className="w-full h-full" style={{ zIndex: 1 }} />

      {/* Top Floating ETA & Live Radar Pill */}
      <div
        className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2 px-3.5 py-1.5 rounded-full shadow-lg border border-[var(--line)] backdrop-blur-md"
        style={{ background: "color-mix(in srgb, var(--surface) 90%, transparent)" }}
      >
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--green-500)] opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[var(--green-500)]"></span>
        </span>
        <span className="text-xs font-bold text-[var(--ink-900)]">
          {displayEta}
        </span>
        {distanceText && (
          <>
            <span className="w-1 h-1 rounded-full bg-[var(--ink-300)]" />
            <span className="text-xs font-medium text-[var(--ink-500)]">{distanceText}</span>
          </>
        )}
      </div>

      {/* Map Control Buttons */}
      {interactive && (
        <div
          className="absolute right-3 z-[1000] flex flex-col gap-1.5"
          style={{ bottom: `calc(${bottomSheetOffsetPx}px + 16px)` }}
        >
          <button
            type="button"
            onClick={handleRecenter}
            className="w-10 h-10 rounded-xl flex items-center justify-center bg-[var(--surface)] text-[var(--ink-700)] shadow-md border border-[var(--line)] hover:bg-[var(--surface-muted)] active:scale-95 transition-transform"
            title="Recenter on delivery route"
            aria-label="Recenter on delivery route"
          >
            <Target size={18} />
          </button>
          <div className="flex flex-col rounded-xl overflow-hidden shadow-md border border-[var(--line)] bg-[var(--surface)]">
            <button
              type="button"
              onClick={handleZoomIn}
              className="w-10 h-9 flex items-center justify-center text-[var(--ink-700)] hover:bg-[var(--surface-muted)] active:scale-95 transition-transform border-b border-[var(--line)]"
              title="Zoom in"
              aria-label="Zoom in"
            >
              <Plus size={16} />
            </button>
            <button
              type="button"
              onClick={handleZoomOut}
              className="w-10 h-9 flex items-center justify-center text-[var(--ink-700)] hover:bg-[var(--surface-muted)] active:scale-95 transition-transform"
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
