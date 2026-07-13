import type { CSSProperties } from "react";

/** Small breathing indicator for data that changes without the user acting —
 *  queue counts, available-now state, unread badges, starts-soon chips.
 *  Pure CSS (`.live-pulse` in index.css); respects prefers-reduced-motion. */
export default function LivePulseDot({ style }: { style?: CSSProperties }) {
  return <span className="live-pulse" style={style} aria-hidden="true" />;
}
