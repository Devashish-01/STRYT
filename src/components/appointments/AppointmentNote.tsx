import { Phone } from "@/components/Icons";

/** Phone numbers a merchant types for a walk-in have nowhere structured to
 *  live — `appointments` has no phone column, so appointmentService folds them
 *  into the note as "Walk-in • <number>". That left the one number staff
 *  actually need to dial sitting in plain text.
 *
 *  Indian mobile numbers, optionally with a +91/0 prefix and the separators
 *  people really type (spaces, dashes). Deliberately narrow: matching loosely
 *  would turn order quantities and prices inside a customer's note into
 *  bogus call links. */
const PHONE_RE = /(?:\+?91[-\s]?|0)?([6-9]\d{4}[-\s]?\d{5})\b/;

function extractPhone(note: string | null | undefined): string | null {
  if (!note) return null;
  const m = PHONE_RE.exec(note);
  if (!m) return null;
  const digits = m[0].replace(/[^\d+]/g, "");
  return digits.length >= 10 ? digits : null;
}

/** The appointment note, with any phone number in it turned into a tap-to-call
 *  action. Shared by the business and provider consoles, which rendered this
 *  block identically. */
export function AppointmentNote({ note }: { note: string | null | undefined }) {
  if (!note) return null;
  const phone = extractPhone(note);
  return (
    <div className="col gap-6" style={{ background: "var(--ink-50)", padding: "var(--space-xs)", borderRadius: 8 }}>
      <div className="tiny" style={{ color: "var(--ink-700)" }}>
        💬 <strong>Note:</strong> {note}
      </div>
      {phone && (
        <a
          className="btn btn-outline btn-sm row gap-6 center"
          href={`tel:${phone}`}
          style={{ alignSelf: "flex-start", fontSize: 12, padding: "4px 12px" }}
        >
          <Phone size={13} /> Call {phone}
        </a>
      )}
    </div>
  );
}
