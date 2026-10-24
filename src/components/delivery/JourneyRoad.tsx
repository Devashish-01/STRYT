/**
 * The shop-to-home strip with the little rider gliding along it. `fraction` is 0..1 from journeyFraction(); there is no location in it —
 * the position comes from the stage of the order (and the server's "minutes away"), never from where anyone actually is.
 */
export function JourneyRoad({ fraction, delivered = false, label }: { fraction: number; delivered?: boolean; label: string }) {
  return (
    <div className="trk-road" role="img" aria-label={label}>
      <span className="trk-road-end shop" aria-hidden="true">🏪</span>
      <div className="trk-road-line"><div className="trk-road-fill" style={{ width: `${Math.round(fraction * 100)}%` }} /></div>
      <span className="trk-road-end home" aria-hidden="true">🏠</span>
      {!delivered && <span className="trk-rider" aria-hidden="true" style={{ left: `calc(16px + (100% - 32px) * ${fraction})` }}>🛵</span>}
    </div>
  );
}
