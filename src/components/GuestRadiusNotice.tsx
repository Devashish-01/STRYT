import { useNavigate } from "react-router-dom";
import { MapPin } from "@/components/Icons";
import { useApp } from "@/store";
import { GUEST_RADIUS_KM } from "@/lib/guestMode";

/**
 * The honest "you're seeing a slice" strip for guests (GUEST_MODE_PLAN.md §4).
 *
 * States the 1 km limit plainly rather than letting a guest assume the street is
 * empty, and turns that limit into the reason to sign in. Renders nothing for
 * signed-in users.
 *
 * If the guest denied location we say so differently — "nothing within 1 km"
 * would be a lie when the truth is we don't know where they are.
 */
export default function GuestRadiusNotice() {
  const { isGuest, guestLocationStatus, requestGuestLocation } = useApp();
  const nav = useNavigate();

  if (!isGuest) return null;

  const denied = guestLocationStatus === "denied";

  return (
    <button
      onClick={() => (denied ? requestGuestLocation() : nav("/auth/phone"))}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        textAlign: "left",
        padding: "10px 14px",
        borderRadius: 14,
        background: "var(--brand-50)",
        border: "1px solid var(--brand-200)",
        cursor: "pointer",
      }}
    >
      <MapPin size={15} color="var(--brand-700)" style={{ flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: 12.5, lineHeight: 1.45, color: "var(--ink-700)" }}>
        {denied ? (
          <>Turn on location to see what's near you</>
        ) : (
          <>Showing what's within {GUEST_RADIUS_KM} km</>
        )}
      </span>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--brand-700)", flexShrink: 0 }}>
        {denied ? "Enable" : "Sign in for more"}
      </span>
    </button>
  );
}
