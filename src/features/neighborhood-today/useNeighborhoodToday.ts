import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabaseClient";
import type { NeighborhoodTodayRaw, TodaySignal } from "./types";

export function useNeighborhoodToday(lat?: number, lng?: number, radiusM = 3000) {
  const [signals, setSignals] = useState<TodaySignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    if (lat == null || lng == null || lat === 0 || lng === 0) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const sb = getSupabase();
        const { data, error: rpcError } = await sb.rpc("neighborhood_today", {
          in_lat: lat,
          in_lng: lng,
          in_radius_m: radiusM,
        });
        if (cancelled) return;
        if (rpcError) throw rpcError;
        setSignals(buildSignals(data as unknown as NeighborhoodTodayRaw));
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "unknown");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [lat, lng, radiusM]);

  return { signals, loading, error };
}

function n(count: number, singular: string, plural = singular + "s"): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function buildSignals(d: NeighborhoodTodayRaw): TodaySignal[] {
  const all: (TodaySignal | null)[] = [
    // 1. Active urgent alert — always first if present
    d.active_alert
      ? {
          key: "active_alert",
          icon: "⚠️",
          tone: "urgent",
          text: d.active_alert.title,
          deepLink: `/community/${d.active_alert.id}`,
        }
      : null,

    // 2. Resolved alerts
    d.alerts_resolved > 0
      ? {
          key: "alerts_resolved",
          icon: "✅",
          tone: "positive",
          text: `${n(d.alerts_resolved, "alert")} resolved today`,
          deepLink: "/community",
        }
      : null,

    // 3. Jobs completed
    d.jobs_completed > 0
      ? {
          key: "jobs_completed",
          icon: "🤝",
          tone: "positive",
          text: `${n(d.jobs_completed, "neighbour")} got help today`,
        }
      : null,

    // 4. Lost & found
    d.lost_found_resolved > 0
      ? {
          key: "lost_found",
          icon: "🐶",
          tone: "positive",
          text: `${n(d.lost_found_resolved, "lost-and-found reunion")}`,
          deepLink: "/community",
        }
      : null,

    // 5. New businesses
    d.new_businesses > 0
      ? {
          key: "new_businesses",
          icon: "🆕",
          tone: "neutral",
          text: `${n(d.new_businesses, "new shop")} opened nearby`,
          deepLink: "/explore?sort=recent",
        }
      : null,

    // 6. Providers available
    d.providers_available > 0
      ? {
          key: "providers",
          icon: "🟢",
          tone: "neutral",
          text: `${n(d.providers_available, "provider")} available right now`,
          deepLink: "/explore?tab=providers",
        }
      : null,

    // 7. Open requests (lowest priority)
    d.open_requests > 0
      ? {
          key: "requests",
          icon: "🙋",
          tone: "neutral",
          text: `${d.open_requests} neighbour${d.open_requests === 1 ? " is" : "s are"} asking for help`,
          deepLink: "/requests",
        }
      : null,
  ];

  return (all.filter(Boolean) as TodaySignal[]).slice(0, 4);
}
