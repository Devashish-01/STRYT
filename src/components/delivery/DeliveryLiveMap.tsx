import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { RASTER_TILES } from "@/lib/mapTiles";
import { useI18n } from "@/lib/i18n";
import { useApp } from "@/store";
import { Plus, Minus } from "@/components/Icons";
import { MapLocateButton } from "@/components/MapLocateButton";
import { recognizeLocation, requestPreciseLocation } from "@/lib/mapLocate";
import { resolveDeliveryRouteEndpoints } from "@/lib/geo/deliveryRoute";
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
  /** Optional short label for the destination pin (e.g. customer name in rider view). */
  destLabel?: string | null;
  status?: string | null;
  etaMinutes?: number | null;
  viewerRole?: "CUSTOMER" | "RIDER";
  onLocateFix?: (fix: { lat: number; lng: number; accuracy?: number }) => void;
  className?: string;
  style?: React.CSSProperties;
  interactive?: boolean;
  bottomSheetOffsetPx?: number;
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
  destLabel,
  status = "EN_ROUTE",
  etaMinutes,
  viewerRole = "CUSTOMER",
  onLocateFix,
  className = "",
  style,
  interactive = true,
  bottomSheetOffsetPx = 180,
}: DeliveryLiveMapProps) {
  const { t, tf } = useI18n();
  const { showToast } = useApp();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const riderMarkerRef = useRef<L.Marker | null>(null);
  const storeMarkerRef = useRef<L.Marker | null>(null);
  const destMarkerRef = useRef<L.Marker | null>(null);
  const destCircleRef = useRef<L.Circle | null>(null);
  const polylineCasingRef = useRef<L.Polyline | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);
  const previewLineRef = useRef<L.Polyline | null>(null);
  const userPannedRef = useRef(false);
  const programmaticMoveRef = useRef(false);

  // Smooth 60 FPS marker interpolation for rider coordinates & heading
  const animatedRider = useMarkerInterpolation(riderLat, riderLng, riderHeading, 2200);

  const [roadRoute, setRoadRoute] = useState<RoadRoute | null>(null);
  const [distanceText, setDistanceText] = useState<string | null>(null);
  const [liveDurationMin, setLiveDurationMin] = useState<number | null>(null);

  // Card mode is when the map is embedded in a small card (e.g. delivery console card)
  const isCardMode = bottomSheetOffsetPx === 0;

  // 1. Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const initialLat = riderLat ?? storeLat ?? destLat ?? 18.5204;
    const initialLng = riderLng ?? storeLng ?? destLng ?? 73.8567;

    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      attributionControl: false,
      dragging: interactive,
      touchZoom: interactive,
      scrollWheelZoom: interactive,
      doubleClickZoom: interactive,
    }).setView([initialLat, initialLng], 15);

    L.tileLayer(RASTER_TILES.url, {
      attribution: RASTER_TILES.attribution,
      maxZoom: RASTER_TILES.maxZoom,
      tileSize: RASTER_TILES.tileSize,
      zoomOffset: RASTER_TILES.zoomOffset,
      className: "delivery-map-tiles",
    }).addTo(map);

    const markUserAdjusted = () => {
      if (!programmaticMoveRef.current) {
        userPannedRef.current = true;
      }
    };
    map.on("dragstart", markUserAdjusted);
    map.on("zoomstart", markUserAdjusted);
    map.on("moveend", () => {
      programmaticMoveRef.current = false;
    });

    mapRef.current = map;

    // Invalidate size multiple times to handle entrance animations and layout settles
    const t1 = setTimeout(() => map.invalidateSize(), 60);
    const t2 = setTimeout(() => map.invalidateSize(), 200);
    const t3 = setTimeout(() => map.invalidateSize(), 500);

    const onWinResize = () => map.invalidateSize();
    window.addEventListener("resize", onWinResize);

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    if (mapContainerRef.current) {
      resizeObserver.observe(mapContainerRef.current);
    }

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      window.removeEventListener("resize", onWinResize);
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, [interactive]); // eslint-disable-line react-hooks/exhaustive-deps

  // 2. Fetch Turn-by-Turn Road Route
  const { origin: routeOrigin, destination: routeDestination, previewLeg } = useMemo(
    () =>
      resolveDeliveryRouteEndpoints({
        riderLat,
        riderLng,
        storeLat,
        storeLng,
        destLat,
        destLng,
        status,
      }),
    [riderLat, riderLng, storeLat, storeLng, destLat, destLng, status]
  );

  useEffect(() => {
    if (!routeOrigin || !routeDestination) {
      setRoadRoute(null);
      return;
    }
    // Don't route if origin and destination are identical
    if (
      Math.abs(routeOrigin.lat - routeDestination.lat) < 0.0001 &&
      Math.abs(routeOrigin.lng - routeDestination.lng) < 0.0001
    ) {
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
          <div style="display:flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:12px;background:#ffffff;border:2.5px solid var(--brand-600);box-shadow:0 4px 14px rgba(0,0,0,0.22);font-size:18px;">
            🏬
          </div>
          <div style="margin-top:3px;white-space:nowrap;background:rgba(15,23,42,0.88);color:#ffffff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:6px;box-shadow:0 2px 6px rgba(0,0,0,0.25);pointer-events:none;">
            ${safeStoreName}
          </div>
        </div>
      `,
      className: "",
      iconSize: [38, 58],
      iconAnchor: [19, 19],
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

    const resolvedDestLabel =
      viewerRole === "RIDER"
        ? destLabel || t("dlv_map_dropoff")
        : destLabel || t("dlv_trk_dest_tooltip") || "Your Doorstep";
    const destIcon = L.divIcon({
      html: `
        <div style="position:relative;display:flex;flex-direction:column;align-items:center;cursor:pointer;">
          <div style="display:flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:50%;background:var(--red-500);border:3px solid #ffffff;box-shadow:0 4px 14px rgba(0,0,0,0.28);font-size:18px;color:#ffffff;">
            🏠
          </div>
          <div style="margin-top:3px;white-space:nowrap;background:var(--red-600);color:#ffffff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:6px;box-shadow:0 2px 6px rgba(0,0,0,0.25);pointer-events:none;">
            ${resolvedDestLabel}
          </div>
        </div>
      `,
      className: "",
      iconSize: [38, 58],
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
  }, [destLat, destLng, destAddress, destLabel, viewerRole, t]);

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

    const riderHtml = `
      <div style="position:relative;width:56px;height:56px;display:flex;align-items:center;justify-content:center;pointer-events:none;">
        <!-- Forward Headlight Beam Cone -->
        <div style="position:absolute;top:50%;left:50%;width:0;height:0;border-left:16px solid transparent;border-right:16px solid transparent;border-top:38px solid rgba(234, 88, 12, 0.38);transform-origin:50% 0%;transform:translate(-50%, -100%) rotate(${heading}deg);filter:blur(2px);pointer-events:none;"></div>

        <!-- Radar Pulse Circle -->
        <div style="position:absolute;width:48px;height:48px;border-radius:50%;background:rgba(234, 88, 12, 0.22);animation:dlv-radar-pulse 2s cubic-bezier(0,0,0.2,1) infinite;"></div>

        <!-- Rider Scooter Vehicle Icon -->
        <div style="position:relative;z-index:3;width:38px;height:38px;border-radius:50%;background:#ea580c;border:2.5px solid #ffffff;box-shadow:0 4px 14px rgba(0,0,0,0.32);display:flex;align-items:center;justify-content:center;transform:rotate(${heading}deg);transition:transform 0.25s linear;">
          <span style="font-size:18px;line-height:1;display:inline-block;transform:rotate(-${heading}deg);">🛵</span>
        </div>

        <!-- Rider Name Badge -->
        ${riderName ? `
          <div style="position:absolute;top:-20px;white-space:nowrap;background:rgba(15,23,42,0.88);color:#ffffff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:6px;box-shadow:0 2px 6px rgba(0,0,0,0.25);z-index:4;">
            ${riderName}
          </div>
        ` : ""}
      </div>
    `;

    const riderIcon = L.divIcon({
      html: riderHtml,
      className: "",
      iconSize: [56, 56],
      iconAnchor: [28, 28],
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
      if (animatedRider.lat != null && animatedRider.lng != null && routeOrigin && Math.abs(animatedRider.lat - routeOrigin.lat) < 0.05) {
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
    } else if (routeOrigin && routeDestination) {
      // Euclidean fallback matching the resolved pickup/delivery leg
      points = [
        [routeOrigin.lat, routeOrigin.lng],
        [routeDestination.lat, routeDestination.lng],
      ];
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

    // Casing line (soft shadow)
    if (polylineCasingRef.current) {
      polylineCasingRef.current.setLatLngs(points);
    } else {
      polylineCasingRef.current = L.polyline(points, {
        color: "#0f172a",
        weight: 7,
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
  }, [roadRoute, routeOrigin, routeDestination, animatedRider.lat, animatedRider.lng]);

  // 6b. Secondary dashed preview leg (Store → Drop-off while rider is heading to pickup)
  useEffect(() => {
    if (!mapRef.current) return;
    if (!previewLeg) {
      if (previewLineRef.current) {
        previewLineRef.current.remove();
        previewLineRef.current = null;
      }
      return;
    }
    const pts: [number, number][] = [
      [previewLeg[0].lat, previewLeg[0].lng],
      [previewLeg[1].lat, previewLeg[1].lng],
    ];
    if (previewLineRef.current) {
      previewLineRef.current.setLatLngs(pts);
    } else {
      previewLineRef.current = L.polyline(pts, {
        color: "#6b21cc",
        weight: 3,
        opacity: 0.55,
        dashArray: "6, 8",
        lineCap: "round",
      }).addTo(mapRef.current);
    }
  }, [previewLeg]);

  // 7. Auto-fit bounds with smart bottom sheet padding (never overrides user zoom/pan on GPS ticks!)
  const fitBounds = useCallback(() => {
    if (!mapRef.current) return;
    const bounds = L.latLngBounds([]);

    const curRiderLat = animatedRider.lat ?? riderLat;
    const curRiderLng = animatedRider.lng ?? riderLng;

    if (curRiderLat != null && curRiderLng != null) bounds.extend([curRiderLat, curRiderLng]);
    if (destLat != null && destLng != null) bounds.extend([destLat, destLng]);
    if (storeLat != null && storeLng != null) bounds.extend([storeLat, storeLng]);

    if (bounds.isValid()) {
      programmaticMoveRef.current = true;
      mapRef.current.fitBounds(bounds, {
        paddingTopLeft: [24, 24],
        paddingBottomRight: [24, Math.min(bottomSheetOffsetPx + 24, 160)],
        maxZoom: 16,
      });
    }
  }, [animatedRider.lat, animatedRider.lng, riderLat, riderLng, destLat, destLng, storeLat, storeLng, bottomSheetOffsetPx]);

  const initialFitDone = useRef(false);
  const lastPhaseKeyRef = useRef<string>("");
  const phaseKey = `${status ?? ""}:${storeLat ?? ""},${storeLng ?? ""}:${destLat ?? ""},${destLng ?? ""}`;

  useEffect(() => {
    const phaseChanged = lastPhaseKeyRef.current !== phaseKey;
    if (phaseChanged) {
      lastPhaseKeyRef.current = phaseKey;
    }
    if (!userPannedRef.current && (!initialFitDone.current || phaseChanged)) {
      fitBounds();
      initialFitDone.current = true;
    }
  }, [fitBounds, phaseKey]);

  const handleSingleLocate = async () => {
    userPannedRef.current = false;
    if (viewerRole === "RIDER") {
      const { fix } = await recognizeLocation();
      if (fix) {
        onLocateFix?.(fix);
        if (mapRef.current && storeLat == null && destLat == null) {
          programmaticMoveRef.current = true;
          mapRef.current.flyTo([fix.lat, fix.lng], 16, { duration: 0.5 });
          return;
        }
      }
    }
    fitBounds();
  };

  const handleDoublePreciseLocate = async () => {
    userPannedRef.current = false;
    showToast(t("map_precise_asking"));
    const { fix, state, openedSettings } = await requestPreciseLocation();
    if (fix) {
      onLocateFix?.(fix);
      if (fix.precision === "precise" && typeof fix.accuracy === "number") {
        showToast(tf("map_precise_updated", { m: Math.max(1, Math.round(fix.accuracy)) }));
      }
      if (mapRef.current) {
        programmaticMoveRef.current = true;
        mapRef.current.flyTo([fix.lat, fix.lng], Math.max(mapRef.current.getZoom(), 16), { duration: 0.5 });
      }
    } else if (!openedSettings && state !== "precise") {
      showToast(t("map_precise_enable_hint"));
    }
  };

  const handleZoomIn = () => {
    userPannedRef.current = true;
    mapRef.current?.zoomIn();
  };
  const handleZoomOut = () => {
    userPannedRef.current = true;
    mapRef.current?.zoomOut();
  };

  // Effective ETA text
  const displayEta = useMemo(() => {
    if (status === "ARRIVED") return t("dlv_pub_arrived") || "Arrived outside your door";
    if (status === "DELIVERED") return t("dlv_pub_done") || "Delivered";
    if (status === "ASSIGNED") return t("dlv_pub_assigned") || "Pickup assigned";
    if (etaMinutes != null) return `${etaMinutes} min away`;
    if (liveDurationMin != null) return `~${liveDurationMin} min away`;
    return t("dlv_pub_on_way") || "On the way";
  }, [status, etaMinutes, liveDurationMin, t]);

  return (
    <div
      className={`delivery-live-map-wrap ${className}`}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: style?.height ? undefined : 200,
        overflow: "hidden",
        userSelect: "none",
        background: "var(--surface-muted)",
        ...style,
      }}
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
      <div
        ref={mapContainerRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: "100%",
          height: "100%",
          zIndex: 1,
        }}
      />

      {/* Top Floating ETA & Live Radar Pill (hidden in tight card mode unless needed) */}
      {!isCardMode && (
        <div
          style={{
            position: "absolute",
            top: 10,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 14px",
            borderRadius: 999,
            boxShadow: "0 4px 14px rgba(0,0,0,0.12)",
            border: "1px solid var(--line)",
            background: "color-mix(in srgb, var(--surface) 92%, transparent)",
            backdropFilter: "blur(8px)",
            whiteSpace: "nowrap",
            maxWidth: "calc(100% - 32px)",
          }}
        >
          <span style={{ position: "relative", display: "inline-flex", width: 9, height: 9, alignItems: "center", justifyContent: "center" }}>
            <span style={{ position: "absolute", width: "100%", height: "100%", borderRadius: "50%", background: "var(--green-500)", opacity: 0.75, animation: "dlv-radar-pulse 2s infinite" }} />
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--green-500)" }} />
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-900)" }}>
            {displayEta}
          </span>
          {distanceText && (
            <>
              <span style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--ink-300)" }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-500)" }}>{distanceText}</span>
            </>
          )}
        </div>
      )}

      {/* Card Mode Compact Distance Badge */}
      {isCardMode && distanceText && (
        <div
          style={{
            position: "absolute",
            top: 8,
            left: 8,
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 10px",
            borderRadius: 999,
            background: "var(--surface)",
            border: "1px solid var(--line)",
            boxShadow: "0 2px 6px rgba(0,0,0,0.12)",
            fontSize: 11,
            fontWeight: 700,
            color: "var(--ink-800)",
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--brand-500)" }} />
          <span>{distanceText}</span>
        </div>
      )}

      {/* Map Control Buttons */}
      {interactive && (
        <div
          style={{
            position: "absolute",
            right: 8,
            bottom: isCardMode ? 8 : `calc(${bottomSheetOffsetPx}px + 12px)`,
            zIndex: 1000,
            display: "flex",
            flexDirection: "column",
            gap: 5,
          }}
        >
          <MapLocateButton
            compact={isCardMode}
            icon="target"
            onSingleTap={handleSingleLocate}
            onDoubleTap={handleDoublePreciseLocate}
          />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              borderRadius: isCardMode ? 8 : 10,
              overflow: "hidden",
              boxShadow: "0 2px 8px rgba(0,0,0,0.14)",
              border: "1px solid var(--line)",
              background: "var(--surface)",
            }}
          >
            <button
              type="button"
              onClick={handleZoomIn}
              style={{
                width: isCardMode ? 32 : 38,
                height: isCardMode ? 28 : 34,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "var(--surface)",
                color: "var(--ink-700)",
                border: "none",
                borderBottom: "1px solid var(--line)",
                cursor: "pointer",
              }}
              title="Zoom in"
              aria-label="Zoom in"
            >
              <Plus size={isCardMode ? 13 : 16} />
            </button>
            <button
              type="button"
              onClick={handleZoomOut}
              style={{
                width: isCardMode ? 32 : 38,
                height: isCardMode ? 28 : 34,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "var(--surface)",
                color: "var(--ink-700)",
                border: "none",
                cursor: "pointer",
              }}
              title="Zoom out"
              aria-label="Zoom out"
            >
              <Minus size={isCardMode ? 13 : 16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
