import { useNavigate } from "react-router-dom";
import { useApp } from "@/store";

/**
 * The STRYT wordmark shown in the top header. Tapping it takes the user to the
 * home of whatever context they're in: the customer Home, the business
 * dashboard, or the provider dashboard.
 */
export default function BrandHome({ color = "#fff", size = 18 }: { color?: string; size?: number }) {
  const nav = useNavigate();
  const { activeContext } = useApp();

  function goHome() {
    if (activeContext.type === "business" && activeContext.id) nav(`/business/${activeContext.id}/manage`);
    else if (activeContext.type === "provider" && activeContext.id) nav(`/provider/${activeContext.id}/manage`);
    else nav("/home");
  }

  return (
    <button
      onClick={goHome}
      aria-label="STRYT home"
      style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color, fontWeight: 800, fontSize: size, letterSpacing: 0.6, lineHeight: 1 }}
    >
      STRYT
    </button>
  );
}
