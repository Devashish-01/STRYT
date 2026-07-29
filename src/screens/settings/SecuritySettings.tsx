import { useEffect, useState } from "react";
import { AppBar } from "@/components/common";
import { useApp } from "@/store";
import PinEntrySheet from "@/components/PinEntrySheet";
import { RecoveryBackfillSheet } from "@/components/entity-password";
import { entityPasswordService } from "@/services";
import type { EntityPasswordKind } from "@/services/core/entityPasswordService";
import { recoveryQuestionLabel } from "@/lib/entityPasswordRecovery";

/**
 * Console passwords for people who sell. Business protection covers everyone
 * you've delegated access to (Team & access), not just yourself — Provider has
 * no delegation, so it only ever protects your own switch-in.
 *
 * Only reachable when you actually own a business or provider profile; the hub
 * hides the row otherwise.
 */
export default function SecuritySettings() {
  const {
    showToast,
    businessPasswordIsSet, providerPasswordIsSet,
    businessRecoveryIsSet, providerRecoveryIsSet,
    refreshEntityPasswordStatus,
    ownedBusinessIds, ownedProviderId,
  } = useApp();

  const [pinSheet, setPinSheet] = useState<{ kind: EntityPasswordKind; mode: "set" | "remove" } | null>(null);
  const [recoveryBackfill, setRecoveryBackfill] = useState<EntityPasswordKind | null>(null);
  const [removingPin, setRemovingPin] = useState(false);

  const needsBusinessRecovery = businessPasswordIsSet && !businessRecoveryIsSet;
  const needsProviderRecovery = providerPasswordIsSet && !providerRecoveryIsSet;

  async function handleRemovePassword(kind: EntityPasswordKind, pin: string) {
    setRemovingPin(true);
    try {
      await entityPasswordService.clear(kind, pin);
      await refreshEntityPasswordStatus();
      showToast(`${kind === "business" ? "Business" : "Provider"} password removed`);
      setPinSheet(null);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Couldn't remove the password.");
    } finally {
      setRemovingPin(false);
    }
  }

  return (
    <div className="screen screen-boxed">
      <AppBar title="Console password" />
      <div className="screen-scroll page-pad col gap-16 scroll-pad-end" style={{ paddingTop: 14 }}>

        {(needsBusinessRecovery || needsProviderRecovery) && (
          <div className="card col gap-8" style={{ padding: 14, background: "var(--amber-50)", border: "1px solid var(--amber-200)" }}>
            <div className="semi small" style={{ color: "var(--amber-800)" }}>Add a backup reset question</div>
            <p className="tiny muted" style={{ lineHeight: 1.45 }}>
              You have a console password but no backup question yet. Add one so you can reset your password if you forget it.
            </p>
            <div className="row gap-8">
              {needsBusinessRecovery && (
                <button type="button" className="btn btn-outline btn-sm grow" onClick={() => setRecoveryBackfill("business")}>
                  Business backup
                </button>
              )}
              {needsProviderRecovery && (
                <button type="button" className="btn btn-outline btn-sm grow" onClick={() => setRecoveryBackfill("provider")}>
                  Provider backup
                </button>
              )}
            </div>
          </div>
        )}

        {ownedBusinessIds.length > 0 && (
          <EntityPasswordSecurityCard
            kind="business"
            title="Business password"
            passwordIsSet={businessPasswordIsSet}
            recoveryIsSet={businessRecoveryIsSet}
            descriptionSet="Required to open your business console — including for anyone you've given team or delegated access to."
            descriptionUnset="Set a password to protect your business console — required of you and anyone you delegate access to."
            onSetPassword={() => setPinSheet({ kind: "business", mode: "set" })}
            onRemovePassword={() => setPinSheet({ kind: "business", mode: "remove" })}
            onManageRecovery={() => setRecoveryBackfill("business")}
          />
        )}

        {!!ownedProviderId && (
          <EntityPasswordSecurityCard
            kind="provider"
            title="Provider password"
            passwordIsSet={providerPasswordIsSet}
            recoveryIsSet={providerRecoveryIsSet}
            descriptionSet="Required whenever you switch into your provider console."
            descriptionUnset="Ask for a password when switching into your provider console — useful if others sometimes use this device."
            onSetPassword={() => setPinSheet({ kind: "provider", mode: "set" })}
            onRemovePassword={() => setPinSheet({ kind: "provider", mode: "remove" })}
            onManageRecovery={() => setRecoveryBackfill("provider")}
          />
        )}
      </div>

      {pinSheet?.mode === "set" && (
        <PinEntrySheet mode="set" kind={pinSheet.kind} onClose={() => setPinSheet(null)} onSaved={() => setPinSheet(null)} />
      )}
      {pinSheet?.mode === "remove" && (
        <PinEntrySheet
          mode="verify"
          kind={pinSheet.kind}
          onClose={() => setPinSheet(null)}
          onVerified={(pin) => { if (!removingPin) void handleRemovePassword(pinSheet.kind, pin); }}
        />
      )}
      {recoveryBackfill && (
        <RecoveryBackfillSheet
          kind={recoveryBackfill}
          onClose={() => setRecoveryBackfill(null)}
          onSaved={() => setRecoveryBackfill(null)}
        />
      )}
    </div>
  );
}

function EntityPasswordSecurityCard({
  kind,
  title,
  passwordIsSet,
  recoveryIsSet,
  descriptionSet,
  descriptionUnset,
  onSetPassword,
  onRemovePassword,
  onManageRecovery,
}: {
  kind: EntityPasswordKind;
  title: string;
  passwordIsSet: boolean;
  recoveryIsSet: boolean;
  descriptionSet: string;
  descriptionUnset: string;
  onSetPassword: () => void;
  onRemovePassword: () => void;
  onManageRecovery: () => void;
}) {
  const [recoveryLabel, setRecoveryLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!passwordIsSet || !recoveryIsSet) {
      setRecoveryLabel(null);
      return;
    }
    let cancelled = false;
    void entityPasswordService.getRecoveryQuestion(kind).then((q) => {
      if (cancelled || !q) return;
      setRecoveryLabel(recoveryQuestionLabel(q.questionId, q.questionText));
    });
    return () => { cancelled = true; };
  }, [kind, passwordIsSet, recoveryIsSet]);

  return (
    <div className="card col gap-10" style={{ padding: 14 }}>
      <div>
        <div className="row gap-8 center-v" style={{ marginBottom: 4 }}>
          <div className="semi small grow">{title}</div>
          {passwordIsSet && (
            <span className="recovery-status-pill recovery-status-pill--on">Protected</span>
          )}
        </div>
        <div className="tiny muted">{passwordIsSet ? descriptionSet : descriptionUnset}</div>
      </div>

      <div className="row gap-8">
        <button type="button" className="btn btn-outline btn-sm grow" onClick={onSetPassword}>
          {passwordIsSet ? "Change password" : "Set password"}
        </button>
        {passwordIsSet && (
          <button type="button" className="btn btn-outline btn-sm grow" style={{ color: "var(--red-600)", borderColor: "var(--red-200)" }} onClick={onRemovePassword}>
            Remove
          </button>
        )}
      </div>

      {passwordIsSet && (
        <>
          <div className="divider" style={{ margin: 0 }} />
          <div>
            <div className="row gap-8 center-v" style={{ marginBottom: 4 }}>
              <div className="semi small grow">Backup reset question</div>
              <span className={`recovery-status-pill ${recoveryIsSet ? "recovery-status-pill--on" : ""}`}>
                {recoveryIsSet ? "Set" : "Not set"}
              </span>
            </div>
            {recoveryIsSet && recoveryLabel ? (
              <div className="tiny muted recovery-question-preview">{recoveryLabel}</div>
            ) : (
              <div className="tiny muted">Used only if you forget your password.</div>
            )}
            <button type="button" className="btn btn-outline btn-sm btn-block" style={{ marginTop: 10 }} onClick={onManageRecovery}>
              {recoveryIsSet ? "Update backup question" : "Add backup question"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
