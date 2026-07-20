import BrandLockup from "./BrandLockup";

// Lightweight, on-brand loading state for the React Suspense boundary that
// wraps <Routes> — shown for the brief moment a not-yet-loaded route's JS
// chunk is downloading (e.g. the first tap into Settings this session).
// Deliberately distinct from AuthSplash (App.tsx): AuthSplash is the heavier,
// full-bleed cold-boot screen shown before the app has ever painted; this is
// the fast, minimal "still here, just a beat behind" state for in-session
// navigation. Reuses the same lamp mark as the app's own headers (BrandLockup
// already has a subtle built-in flicker animation) instead of a foreign
// spinner, so it reads as the app continuing rather than a new screen loading.
export default function RouteFallback() {
  return (
    <div
      className="screen"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "var(--bg)",
      }}
    >
      <BrandLockup glow={1} size={30} ariaLabel="Loading" />
    </div>
  );
}
