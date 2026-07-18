/** Friendly per-kind copy for a lead row — shared between business and
 *  provider `leads()` so both get the same human-readable text instead of
 *  provider falling back to a generic "Reached out via STRYT" for every kind. */
export function leadText(kind: string, note?: string): string {
  switch (kind) {
    case "CALL": return "Called you via STRYT";
    case "DIRECTIONS": return "Got directions to your shop";
    case "QUESTION": return note ? `Asked: ${note}` : "Asked a question";
    case "OFFER_CLIP": return "Clipped one of your offers";
    case "STORY_REPLY": return "Replied to your story";
    case "MESSAGE": return "Sent you a message";
    default: return note || "Reached out via STRYT";
  }
}
