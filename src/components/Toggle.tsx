// Shared on/off pill switch — the single visual for every binary toggle in
// the app (shop "Open now", queue on/off, etc.) so they all look and animate
// identically instead of each screen reimplementing its own inline markup.
export default function Toggle({ on }: { on: boolean }) {
  return (
    <span style={{ width: 44, height: 26, borderRadius: 999, background: on ? "var(--green-500)" : "var(--ink-200)", position: "relative", flexShrink: 0 }}>
      <span style={{ position: "absolute", top: 3, left: on ? 21 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
    </span>
  );
}
