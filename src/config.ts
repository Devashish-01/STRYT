// Central runtime config for live app.
export const config = {
  apiUrl: (import.meta as any).env?.VITE_API_URL ?? "https://api.stryt.app/v1",
  mapboxToken: (import.meta as any).env?.VITE_MAPBOX_TOKEN ?? "",
  appName: "STRYT",
  bugReportExcelUrl: (import.meta as any).env?.VITE_BUG_REPORT_EXCEL_URL ?? "",
  supabaseUrl: (import.meta as any).env?.VITE_SUPABASE_URL ?? "",
  supabaseAnonKey: (import.meta as any).env?.VITE_SUPABASE_ANON_KEY ?? "",
  defaultLocation: {
    lat: Number((import.meta as any).env?.VITE_DEFAULT_LAT ?? 18.536),
    lng: Number((import.meta as any).env?.VITE_DEFAULT_LNG ?? 73.893),
  },
  defaultCountry: (import.meta as any).env?.VITE_DEFAULT_COUNTRY ?? "IN",
  presetLocations: [
    { area: "Koregaon Park", full: "Koregaon Park, Pune, Maharashtra", lat: 18.536, lng: 73.893, emoji: "🌳" },
    { area: "Kalyani Nagar", full: "Kalyani Nagar, Pune, Maharashtra", lat: 18.547, lng: 73.901, emoji: "🏢" },
    { area: "Marathahalli", full: "Marathahalli, Bengaluru, Karnataka", lat: 12.956, lng: 77.701, emoji: "💻" },
  ],
};
