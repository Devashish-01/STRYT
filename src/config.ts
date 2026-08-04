// Central runtime config for live app.
export const config = {
  // stryt.in is the live host — api.stryt.app has never resolved, so the old
  // fallback silently pointed apiClient at nothing whenever VITE_API_URL was
  // unset. Matches .env.example.
  apiUrl: (import.meta as any).env?.VITE_API_URL ?? "https://stryt.in",
  mapboxToken: String((import.meta as any).env?.VITE_MAPBOX_TOKEN ?? "").trim(),
  appName: "STRYT",
  bugReportExcelUrl: (import.meta as any).env?.VITE_BUG_REPORT_EXCEL_URL ?? "",
  bugReportScriptUrl: (import.meta as any).env?.VITE_BUG_REPORT_SCRIPT_URL ?? "",
  supabaseUrl: (import.meta as any).env?.VITE_SUPABASE_URL ?? "",
  supabaseAnonKey: (import.meta as any).env?.VITE_SUPABASE_ANON_KEY ?? "",
  defaultLocation: {
    lat: Number((import.meta as any).env?.VITE_DEFAULT_LAT ?? 18.536),
    lng: Number((import.meta as any).env?.VITE_DEFAULT_LNG ?? 73.893),
  },
  defaultCountry: (import.meta as any).env?.VITE_DEFAULT_COUNTRY ?? "IN",
};

// Every Edge Function call needs this same base — centralized so it isn't
// hand-rebuilt (and occasionally mistyped) at each call site.
export function functionUrl(name: string): string {
  return `${config.supabaseUrl}/functions/v1/${name}`;
}
