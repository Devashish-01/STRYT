import { useEffect, useRef, useState } from "react";

const THRESHOLD = 70;
const MAX_PULL = 110;

/**
 * Attaches a native-feeling pull-to-refresh gesture to whatever scrollable
 * element `containerRef` is placed on. Only activates when that element (and
 * the document) are already scrolled to the very top, so it never fights a
 * normal downward drag mid-list.
 */
export function usePullToRefresh<T extends HTMLElement>(onRefresh: () => void | Promise<void>) {
  const containerRef = useRef<T | null>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const startY = useRef(0);
  const dragging = useRef(false);
  const distanceRef = useRef(0);
  const refreshingRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    // Only wire up pull-to-refresh on touch devices (mobile/tablet).
    // On desktop pointer devices the gesture is meaningless and we should not
    // consume touch events or render the indicator.
    const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    if (!isTouchDevice) return;

    const el = containerRef.current;
    if (!el) return;

    const atTop = () => el.scrollTop <= 0 && window.scrollY <= 0;

    function onTouchStart(e: TouchEvent) {
      if (refreshingRef.current || !atTop()) return;
      startY.current = e.touches[0].clientY;
      dragging.current = true;
    }

    function onTouchMove(e: TouchEvent) {
      if (!dragging.current) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0 || !atTop()) {
        dragging.current = false;
        distanceRef.current = 0;
        setPullDistance(0);
        return;
      }
      const resisted = dy < MAX_PULL ? dy : MAX_PULL + (dy - MAX_PULL) * 0.2;
      distanceRef.current = resisted;
      setPullDistance(resisted);
      if (e.cancelable) e.preventDefault();
    }

    async function onTouchEnd() {
      if (!dragging.current) return;
      dragging.current = false;
      const finalDistance = distanceRef.current;
      if (finalDistance >= THRESHOLD) {
        refreshingRef.current = true;
        setRefreshing(true);
        setPullDistance(THRESHOLD);
        try {
          await onRefreshRef.current();
        } finally {
          refreshingRef.current = false;
          setRefreshing(false);
          setPullDistance(0);
          distanceRef.current = 0;
        }
      } else {
        setPullDistance(0);
        distanceRef.current = 0;
      }
    }

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, []);

  return { containerRef, pullDistance, refreshing, threshold: THRESHOLD };
}
