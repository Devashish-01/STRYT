// Central runtime config for live app.
export const config = {
  apiUrl: (import.meta as any).env?.VITE_API_URL ?? "https://api.stryt.app/v1",
  mapboxToken: (import.meta as any).env?.VITE_MAPBOX_TOKEN ?? "",
  appName: "STRYT",
  bugReportExcelUrl: (import.meta as any).env?.VITE_BUG_REPORT_EXCEL_URL ?? "",
};
