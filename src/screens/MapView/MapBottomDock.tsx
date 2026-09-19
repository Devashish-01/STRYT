import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

/**
 * The strip that sits just above the results sheet: the guest radius notice, the pin-drop confirm card. It
 * publishes its measured height as --map-dock-h, which the pin/recenter buttons and the map credit line add to
 * their own `bottom` (index.css). All of them used to anchor to the same line, so the notice covered the recenter
 * button and the credit.
 */
export default function MapBottomDock({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement.style;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height ?? 0;
      // + the 8px gap the buttons keep above the dock
      root.setProperty("--map-dock-h", h > 0 ? `${Math.round(h) + 8}px` : "0px");
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.removeProperty("--map-dock-h");
    };
  }, []);

  return (
    <div ref={ref} className="map-bottom-dock" style={style}>
      {children}
    </div>
  );
}
