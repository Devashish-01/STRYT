export interface NeighborhoodTodayRaw {
  new_businesses: number;
  jobs_completed: number;
  providers_available: number;
  open_requests: number;
  alerts_resolved: number;
  lost_found_resolved: number;
  active_alert: { id: string; title: string } | null;
}

export interface TodaySignal {
  key: string;
  icon: string;
  text: string;
  tone: "urgent" | "positive" | "neutral";
  deepLink?: string;
}
