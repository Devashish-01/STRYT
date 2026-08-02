import { useEffect, useRef, useState } from "react";
import { AlertTriangle, X } from "@/components/Icons";
import { haptics } from "@/lib/haptics";
import type { CancelReason } from "@/services/engagement/deliveryService";

/**
 * "Can't deliver" — the agent's exit from an order they can't complete
 * (DLV-001). Until this existed, an undeliverable order had no terminal state
 * and its agent was stuck on duty permanently.
 *
 * This is the most delicate screen in the delivery flow: a stressed person,
 * one-handed, possibly roadside, taking an action that can't be undone. Three
 * things follow from that and none are decoration:
 *
 *   1. The SAFE action is the visually dominant one. "Keep trying" is the
 *      filled button; the destructive path is text-only until deliberately
 *      chosen, then arms for a second tap — the same idiom NewRunGate already
 *      uses for declining a run, so this introduces no new gesture to learn.
 *   2. A reason is required before the destructive path is reachable at all.
 *      The reason is the only thing the business has to act on.
 *   3. It cannot be dismissed while the request is in flight. A half-sent
 *      cancel that vanishes leaves the agent with no idea what state they're in.
 */

type Variant = "agent" | "business";

/**
 * Both sides cancel through the same RPC and the same sheet — but not the same
 * reasons. "Unsafe to deliver" and "Personal emergency" are things only the
 * person on the doorstep can report; offering them to an owner sitting in the
 * shop would be asking them to speak for someone else.
 */
const REASONS: { value: CancelReason; label: string; hint: string; only?: Variant }[] = [
  { value: "CUSTOMER_UNAVAILABLE", label: "Customer unavailable", hint: "No answer at the door or on the phone" },
  { value: "ADDRESS_PROBLEM",      label: "Address problem",      hint: "Wrong, incomplete, or can't find it" },
  { value: "CUSTOMER_REFUSED",     label: "Customer refused",     hint: "They didn't want to take it" },
  { value: "UNSAFE",               label: "Unsafe to deliver",    hint: "You didn't feel safe completing it", only: "agent" },
  { value: "AGENT_EMERGENCY",      label: "Personal emergency",   hint: "Something came up and you had to stop", only: "agent" },
  { value: "OTHER",                label: "Something else",       hint: "Say what happened" },
];

const ARM_MS = 4000;

const COPY: Record<Variant, { title: string; keep: string; destructive: string; notePlaceholder: string }> = {
  agent: {
    title: "Can't deliver?",
    keep: "Keep trying",
    destructive: "Can't deliver this order",
    notePlaceholder: "What happened? The business sees this.",
  },
  business: {
    title: "Cancel this delivery?",
    keep: "Leave it running",
    destructive: "Cancel this delivery",
    notePlaceholder: "What happened? The agent sees this.",
  },
};

export default function CantDeliverSheet({
  orderLabel, customerName, busy, variant = "agent", onConfirm, onClose,
}: {
  /** Which order this is — an irreversible action must name its target. */
  orderLabel: string;
  customerName: string;
  busy: boolean;
  /** Who's cancelling. Changes the reason list and the copy, not the action. */
  variant?: Variant;
  onConfirm: (reason: CancelReason, note: string) => void;
  onClose: () => void;
}) {
  const copy = COPY[variant];
  const reasons = REASONS.filter((r) => !r.only || r.only === variant);
  const [reason, setReason] = useState<CancelReason | null>(null);
  const [note, setNote] = useState("");
  const [armed, setArmed] = useState(false);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noteRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => () => { if (armTimer.current) clearTimeout(armTimer.current); }, []);

  // Picking a different reason must re-arm from scratch — otherwise a tap
  // meant to change the reason could land on an already-armed confirm.
  function pickReason(next: CancelReason) {
    haptics.selection();
    setReason(next);
    disarm();
    if (next === "OTHER") setTimeout(() => noteRef.current?.focus(), 220);
  }

  function disarm() {
    setArmed(false);
    if (armTimer.current) clearTimeout(armTimer.current);
  }

  const noteRequired = reason === "OTHER";
  const noteReady = !noteRequired || note.trim().length > 2;
  const canProceed = !!reason && noteReady && !busy;

  function handleDestructiveTap() {
    if (!canProceed) return;
    if (!armed) {
      haptics.warning();
      setArmed(true);
      armTimer.current = setTimeout(() => setArmed(false), ARM_MS);
      return;
    }
    if (armTimer.current) clearTimeout(armTimer.current);
    onConfirm(reason!, note.trim());
  }

  // Backdrop and close are inert while the request is in flight.
  function requestClose() {
    if (busy) return;
    onClose();
  }

  return (
    <div className="overlay" onClick={requestClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />

        <div className="row between center-v" style={{ marginBottom: 2 }}>
          <div className="row gap-8 center-v">
            <span
              style={{
                width: 30, height: 30, borderRadius: 9, flexShrink: 0,
                background: "var(--red-50)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <AlertTriangle size={16} color="var(--red-600)" />
            </span>
            <h3 className="bold h2">{copy.title}</h3>
          </div>
          <button
            className="icon-btn"
            onClick={requestClose}
            disabled={busy}
            aria-label="Close"
            style={{ background: "var(--ink-100)", flexShrink: 0 }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Naming the order is not decoration — it's what stops the wrong one
            being cancelled when several are open. */}
        <p className="small muted" style={{ marginBottom: 14 }}>
          {orderLabel} · {customerName}
        </p>

        <div className="col gap-8" role="radiogroup" aria-label="Reason">
          {reasons.map((r) => {
            const selected = reason === r.value;
            return (
              <button
                key={r.value}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={busy}
                className="row between center-v"
                onClick={() => pickReason(r.value)}
                style={{
                  minHeight: 52, // ≥44pt target, one-handed, in the rain
                  padding: "10px 14px",
                  borderRadius: 12,
                  textAlign: "left",
                  border: selected ? "2px solid var(--delivery-600)" : "1.5px solid var(--ink-200)",
                  background: selected ? "var(--delivery-50)" : "var(--surface, #fff)",
                }}
              >
                <span className="col" style={{ minWidth: 0, gap: 1 }}>
                  <span className="semi small">{r.label}</span>
                  <span className="tiny muted ellipsis">{r.hint}</span>
                </span>
                <span
                  aria-hidden
                  style={{
                    width: 18, height: 18, borderRadius: "50%", flexShrink: 0, marginLeft: 10,
                    border: selected ? "5px solid var(--delivery-600)" : "2px solid var(--ink-300)",
                  }}
                />
              </button>
            );
          })}
        </div>

        {noteRequired && (
          <textarea
            ref={noteRef}
            className="input"
            rows={2}
            value={note}
            disabled={busy}
            onChange={(e) => setNote(e.target.value)}
            placeholder={copy.notePlaceholder}
            style={{ marginTop: 10, resize: "none" }}
          />
        )}

        {/* Safe action first and dominant. The destructive one stays quiet
            until a reason exists, then arms — never one tap from irreversible. */}
        <button
          className="btn btn-delivery btn-block"
          style={{ marginTop: 16, height: 50, fontSize: 16, fontWeight: 700 }}
          onClick={requestClose}
          disabled={busy}
        >
          {copy.keep}
        </button>

        <button
          className="btn btn-block"
          onClick={handleDestructiveTap}
          disabled={!canProceed}
          style={{
            marginTop: 8,
            height: 46,
            background: armed ? "var(--red-500)" : "transparent",
            color: armed ? "#fff" : canProceed ? "var(--red-600)" : "var(--ink-400)",
            border: armed ? "none" : "1.5px solid transparent",
            fontWeight: armed ? 700 : 600,
            transition: "background 160ms ease, color 160ms ease",
          }}
        >
          {busy
            ? "Sending…"
            : armed
              ? "Tap again to confirm"
              : reason
                ? copy.destructive
                : "Pick a reason first"}
        </button>

        {armed && !busy && (
          <button className="tiny muted" style={{ alignSelf: "center", marginTop: 8, width: "100%" }} onClick={disarm}>
            Never mind
          </button>
        )}
      </div>
    </div>
  );
}
