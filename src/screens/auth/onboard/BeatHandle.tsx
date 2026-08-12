import { useEffect, useRef, useState } from "react";
import { Check, X as XIcon, Loader } from "@/components/Icons";
import { useI18n } from "@/lib/i18n";
import { normalizeAlias, isValidAlias } from "@/lib/publicName";
import { suggestAliases } from "@/lib/aliasSuggest";
import { userService } from "@/services";
import { BeatFrame } from "./BeatFrame";

type Availability = "idle" | "checking" | "free" | "taken";

/**
 * Beat 2 — "Pick your @handle".
 *
 * The one thing here that cannot be derived and cannot be skipped: the
 * alias/real-name privacy model gives every user a public handle so their real
 * name never has to be the thing strangers see. So the goal isn't to remove
 * the step, it's to make the default path a tap — three name-derived
 * candidates, checked together in ONE round trip before any are shown, so we
 * never offer a handle that's already gone.
 *
 * The custom field reuses the same RPC, debounced. Previously the only way to
 * discover a collision was to submit and catch the unique-index violation,
 * i.e. after the user had already decided.
 */
export function BeatHandle({
  name,
  email,
  busy,
  onDone,
}: {
  name: string;
  email?: string;
  busy?: boolean;
  onDone: (alias: string) => void;
}) {
  const { t } = useI18n();
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [chosen, setChosen] = useState("");
  const [custom, setCustom] = useState("");
  const [avail, setAvail] = useState<Availability>("idle");
  /** Guards against a slow earlier check overwriting a newer one's verdict. */
  const checkSeq = useRef(0);

  // One batched availability call for all three candidates, on mount. Only the
  // free ones are ever rendered, so a suggestion can't be a dead end.
  useEffect(() => {
    let active = true;
    const candidates = suggestAliases(name, email);
    if (candidates.length === 0) return;
    userService
      .aliasesAvailable(candidates)
      .then((map) => {
        if (!active) return;
        const free = candidates.filter((c) => map[c]);
        setSuggestions(free);
        // Pre-select the best free one so the happy path is Continue, not
        // "pick, then Continue". Tapping another swaps it.
        if (free.length > 0) setChosen((prev) => prev || free[0]);
      })
      .catch(() => {
        // Offline or the RPC isn't deployed yet — fall back to the custom
        // field alone rather than showing handles we can't vouch for.
        if (active) setSuggestions([]);
      });
    return () => { active = false; };
  }, [name, email]);

  // Debounced check for the custom field.
  useEffect(() => {
    const candidate = normalizeAlias(custom);
    if (!custom) { setAvail("idle"); return; }
    if (!isValidAlias(candidate)) { setAvail("idle"); return; }
    setAvail("checking");
    const seq = ++checkSeq.current;
    const timer = setTimeout(() => {
      userService
        .aliasesAvailable([candidate])
        .then((map) => {
          if (seq !== checkSeq.current) return;
          setAvail(map[candidate] ? "free" : "taken");
        })
        .catch(() => {
          if (seq !== checkSeq.current) return;
          // Unknown, not "free" — the write path still enforces uniqueness, so
          // let them proceed rather than blocking on a network blip.
          setAvail("idle");
        });
    }, 400);
    return () => clearTimeout(timer);
  }, [custom]);

  const customClean = normalizeAlias(custom);
  const usingCustom = custom.length > 0;
  const value = usingCustom ? customClean : chosen;
  const ready = isValidAlias(value) && (!usingCustom || avail === "free" || avail === "idle");

  return (
    <BeatFrame
      title={t("ob_beat2_title")}
      sub={t("ob_beat2_sub")}
      ctaLabel={t("ob_continue")}
      ctaDisabled={!ready}
      ctaBusy={busy}
      onCta={() => onDone(value)}
    >
      {suggestions.length > 0 && (
        <>
          <div className="ob-label">{t("ob_beat2_pick")}</div>
          <div className="ob-chips">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                className={`chip-pill ${!usingCustom && chosen === s ? "active" : ""}`}
                onClick={() => { setChosen(s); setCustom(""); }}
              >
                @{s}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="ob-label" style={{ marginTop: suggestions.length > 0 ? 18 : 0 }}>
        {suggestions.length > 0 ? t("ob_beat2_custom") : t("ob_beat2_title")}
      </div>
      <div className="ob-handle-field">
        <span className="ob-handle-at">@</span>
        <input
          className="input ob-handle-input"
          value={custom}
          onChange={(e) => setCustom(normalizeAlias(e.target.value))}
          placeholder="yourname"
          maxLength={20}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-label={t("ob_beat2_title")}
        />
        {usingCustom && (
          <span className={`ob-handle-state ${avail}`}>
            {avail === "checking" && <Loader className="spin" size={15} />}
            {avail === "free" && <Check size={16} />}
            {avail === "taken" && <XIcon size={16} />}
          </span>
        )}
      </div>
      <div className={`ob-hint ${usingCustom && avail === "taken" ? "bad" : ""}`}>
        {usingCustom && avail === "taken"
          ? t("ob_handle_taken")
          : usingCustom && avail === "free"
          ? t("ob_handle_free")
          : usingCustom && avail === "checking"
          ? t("ob_handle_checking")
          : t("ob_handle_hint")}
      </div>
    </BeatFrame>
  );
}
