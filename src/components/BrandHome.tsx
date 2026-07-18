import { useNavigate } from "react-router-dom";
import { useApp } from "@/store";
import BrandLockup from "./BrandLockup";
import { contextHomePath } from "@/lib/contextHome";

/**
 * The STRYT brand lockup shown in the top header. Tapping it takes the user to
 * the home of whatever context they're in: the customer Home, the business
 * dashboard, or the provider dashboard.
 *
 * `glow` comes from `useAmbientTheme().lampGlow` so the lamp burns brighter as
 * the day turns to night. `color` tints the lamp + wordmark (white on the
 * coloured headers).
 */
export default function BrandHome({
  color = "#fff",
  size = 20,
  glow = 0.5,
}: {
  color?: string;
  size?: number;
  glow?: number;
}) {
  const nav = useNavigate();
  const { activeContext } = useApp();

  function goHome() {
    nav(contextHomePath(activeContext));
  }

  return (
    <span style={{ color, display: "inline-flex" }}>
      <BrandLockup glow={glow} size={size} onClick={goHome} />
    </span>
  );
}
