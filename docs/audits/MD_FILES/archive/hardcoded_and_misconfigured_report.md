# Audit Report: Hardcoded Configurations & Code Biases

This report outlines all identified hardcoded values, duplicated configurations, and location/API biases across the STRYT codebase.

---

## 1. Duplicated & Scattered Geolocation Coordinates (Pune Bias)
* **Status**: Hardcoded
* **Found in**:
  * [discoveryService.ts:L19](file:///d:/zetax/name/STRYT/src/services/discoveryService.ts#L19)
  * [providerService.ts:L74](file:///d:/zetax/name/STRYT/src/services/providerService.ts#L74)
  * [businessService.ts:L98](file:///d:/zetax/name/STRYT/src/services/businessService.ts#L98)
  * [MapView.tsx:L95, L294](file:///d:/zetax/name/STRYT/src/screens/MapView.tsx#L95)
  * [LocationPicker.tsx:L8](file:///d:/zetax/name/STRYT/src/components/LocationPicker.tsx#L8)
  * [LocationPickerSheet.tsx:L79](file:///d:/zetax/name/STRYT/src/components/LocationPickerSheet.tsx#L79)
* **Details**: Whenever location permission is denied or coordinates are unavailable, the application falls back to `lat: 18.536, lng: 73.893` (Koregaon Park, Pune).
* **Impact**: If the app is launched in a different city or country, users who block GPS permission will be shown Pune search feeds and map screens by default.
* **Recommendation**: Move these fallback coordinates to the central configuration in [config.ts](file:///d:/zetax/name/STRYT/src/config.ts) (e.g. `config.defaultLocation`).

---

## 2. Hardcoded Country Code in Mapbox Forward Geocoding
* **Status**: Hardcoded
* **Found in**: [geocode.ts:L41](file:///d:/zetax/name/STRYT/src/lib/geocode.ts#L41)
* **Details**: The forward geocoding query restricts Mapbox results strictly to India:
  ```typescript
  const url = `${BASE}/${encodeURIComponent(q)}.json?access_token=${token}&types=neighborhood,locality,place,address&limit=5&language=en&country=IN`;
  ```
* **Impact**: Prevents searches for remote addresses or regions outside of India.
* **Recommendation**: Make the country parameter configurable via environment variables/config or dynamically detect country codes based on the current user center.

---

## 3. Duplicated `RADIUS_OPTIONS` Arrays
* **Status**: Redundant/Hardcoded
* **Found in**:
  * [AllCategories.tsx:L9](file:///d:/zetax/name/STRYT/src/screens/AllCategories.tsx#L9)
  * [Explore.tsx:L262](file:///d:/zetax/name/STRYT/src/screens/Explore.tsx)
  * [MapView.tsx](file:///d:/zetax/name/STRYT/src/screens/MapView.tsx)
  * [Settings.tsx](file:///d:/zetax/name/STRYT/src/screens/Settings.tsx)
  * [UserOnboard.tsx](file:///d:/zetax/name/STRYT/src/screens/auth/UserOnboard.tsx)
* **Details**: The list of available radius options is declared statically in multiple components.
* **Impact**: If the team decides to adjust or add presets (e.g., adding `3 km`), the array must be modified in 5 separate files, creating a maintenance burden.
* **Recommendation**: Export `RADIUS_OPTIONS` from a central constants file and import it where needed.

---

## 4. Direct Env Variable Access (Bypassing `config.ts`)
* **Status**: Misconfigured
* **Found in**: [TrackingPage.tsx:L9-L10, L78](file:///d:/zetax/name/STRYT/src/screens/TrackingPage.tsx#L9)
* **Details**: Visited elements read `(import.meta as any).env.VITE_SUPABASE_URL` and `VITE_MAPBOX_TOKEN` directly instead of referencing the central configuration in [config.ts](file:///d:/zetax/name/STRYT/src/config.ts).
* **Impact**: Breaks central configuration pattern; local config overrides won't reflect on the Tracking page.
* **Recommendation**: Replace direct `(import.meta as any).env` reads with imports from `config`.

---

## 5. Statically Seeded Locations in Location Sheet Picker
* **Status**: Hardcoded
* **Found in**: [LocationPickerSheet.tsx:L78-L82](file:///d:/zetax/name/STRYT/src/components/LocationPickerSheet.tsx#L78)
* **Details**: The location selection helper sheet hardcodes presets for Pune (Koregaon Park, Kalyani Nagar) and Bangalore (Marathahalli).
* **Impact**: Restricts quick location change choices to three specific Indian neighborhoods.
* **Recommendation**: Fetch popular preset locations from a database table or allow customization based on the user's active city.
