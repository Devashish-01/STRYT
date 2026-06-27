// Central runtime config. Flip VITE_USE_MOCKS=false + set VITE_API_URL to go live.
export const config = {
  apiUrl: (import.meta as any).env?.VITE_API_URL ?? "https://api.stryt.app/v1",
  useMocks: ((import.meta as any).env?.VITE_USE_MOCKS ?? "true") !== "false",
  mapboxToken: (import.meta as any).env?.VITE_MAPBOX_TOKEN ?? "",
  appName: "STRYT",
  mockLatencyMs: 280,
  bugReportExcelUrl: (import.meta as any).env?.VITE_BUG_REPORT_EXCEL_URL ?? "",
};
