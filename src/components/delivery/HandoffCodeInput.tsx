import { useRef } from "react";

const LENGTH = 6;

/**
 * Compact 6-box handoff-code entry — the same paste-fill/auto-advance/
 * backspace-to-previous interaction as OtpVerify.tsx's auth code boxes, but
 * a smaller, chrome-free variant sized for inline/bottom-bar use: this is a
 * quick, one-handed field entry while a delivery is in progress, not a
 * dedicated full-screen auth step.
 */
export default function HandoffCodeInput({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length: LENGTH }, (_, i) => value[i] ?? "");

  function set(i: number, raw: string) {
    const clean = raw.replace(/\D/g, "");
    if (clean.length > 1) {
      // Paste of the full code into any box — fill from position 0.
      const next = Array.from({ length: LENGTH }, (_, k) => clean[k] ?? "");
      onChange(next.join(""));
      refs.current[Math.min(clean.length, LENGTH - 1)]?.focus();
      return;
    }
    const val = clean.slice(-1);
    const next = [...digits];
    next[i] = val;
    onChange(next.join(""));
    if (val && i < LENGTH - 1) refs.current[i + 1]?.focus();
  }

  return (
    <div className="row gap-6 center">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => (refs.current[i] = el)}
          className="input"
          inputMode="numeric"
          maxLength={LENGTH}
          disabled={disabled}
          value={d}
          onChange={(e) => set(i, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !digits[i] && i > 0) refs.current[i - 1]?.focus();
          }}
          style={{
            width: 34, height: 40, textAlign: "center", fontSize: 17, fontWeight: 800,
            padding: 0, flexShrink: 0,
          }}
        />
      ))}
    </div>
  );
}
