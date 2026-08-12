import { SettingsToggleRow } from "@/components/settings";

/**
 * Shared opt-in for appointments during business/provider onboarding.
 * Default is OFF — hours editors only appear once the owner flips this on.
 */
export function OnboardBookingsToggle({
  on,
  onChange,
  accentColor = "var(--brand-600)",
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  accentColor?: string;
}) {
  return (
    <div className="card col gap-10" style={{ padding: 16, border: `1.5px solid ${accentColor}` }}>
      <SettingsToggleRow
        label="Accept appointments"
        hint={
          on
            ? "Set your working hours — customers will book against these"
            : "Skip for now — your page will show products/services only"
        }
        on={on}
        onChange={onChange}
      />
      {!on && (
        <span className="tiny muted">
          You can turn on appointments anytime from Settings after you're live.
        </span>
      )}
    </div>
  );
}
