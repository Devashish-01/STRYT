import type { ReactNode } from "react";
import { Loader } from "@/components/Icons";
import { useI18n } from "@/lib/i18n";

/**
 * The shared chrome for every onboarding beat: one question, its body, one
 * primary action, and an optional skip.
 *
 * A frame rather than four hand-laid screens because the whole point of the
 * redesign is that the *frame* never moves — only the question inside it
 * changes. If each beat positioned its own heading and button they would drift
 * by a few pixels each and the flow would feel like four screens instead of
 * one screen thinking.
 */
export function BeatFrame({
  title,
  sub,
  children,
  ctaLabel,
  ctaDisabled,
  ctaBusy,
  onCta,
  onSkip,
  skipLabel,
  footer,
}: {
  title: string;
  sub?: string;
  children?: ReactNode;
  ctaLabel: string;
  ctaDisabled?: boolean;
  ctaBusy?: boolean;
  onCta: () => void;
  onSkip?: () => void;
  skipLabel?: string;
  /** Rendered under the CTA, above the skip — e.g. the language switcher. */
  footer?: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="ob-beat">
      <div className="ob-beat-head">
        <h1 className="ob-beat-title">{title}</h1>
        {sub && <p className="ob-beat-sub">{sub}</p>}
      </div>

      <div className="ob-beat-body">{children}</div>

      <div className="ob-beat-foot">
        <button
          type="button"
          className="btn btn-primary btn-block btn-lg ob-cta"
          disabled={ctaDisabled || ctaBusy}
          onClick={onCta}
        >
          {ctaBusy ? <><Loader className="spin" size={17} /> {t("saving_setup")}</> : ctaLabel}
        </button>
        {footer}
        {onSkip && (
          <button type="button" className="ob-skip" onClick={onSkip} disabled={ctaBusy}>
            {skipLabel ?? t("skip_for_now")}
          </button>
        )}
      </div>
    </div>
  );
}
