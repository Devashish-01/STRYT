import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, LogOut, ArrowRight, Loader } from "@/components/Icons";
import { useApp } from "@/store";
import { profileControlService } from "@/services/core/profileControlService";
import { ACCOUNT_DELETION_GRACE_DAYS } from "@/lib/accountDeletion";

export default function DeletionPending() {
  const nav = useNavigate();
  const { user, refreshUser, showToast, signOut } = useApp();
  const [cancelling, setCancelling] = useState(false);
  const [purging, setPurging] = useState(false);

  const daysRemaining = (() => {
    if (!user.deletionScheduledAt) return ACCOUNT_DELETION_GRACE_DAYS;
    const purgeDate = new Date(user.deletionScheduledAt);
    const msLeft = purgeDate.getTime() - Date.now();
    return Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));
  })();

  const graceEnded = !!user.deletionScheduledAt && daysRemaining === 0;

  const deletionDateStr = user.deletionScheduledAt
    ? new Date(user.deletionScheduledAt).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : `${ACCOUNT_DELETION_GRACE_DAYS} days`;

  // When the grace period has ended, complete deletion automatically (no admin).
  useEffect(() => {
    if (!graceEnded || purging || cancelling) return;
    let cancelled = false;
    (async () => {
      setPurging(true);
      try {
        await profileControlService.completeScheduledDeletion();
        if (cancelled) return;
        showToast("Your account has been permanently deleted.");
        await signOut();
        nav("/", { replace: true });
      } catch (err: any) {
        if (!cancelled) {
          showToast(err?.message || "Could not finish deleting your account. We'll retry shortly.");
          setPurging(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [graceEnded]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCancelDeletion() {
    setCancelling(true);
    try {
      await profileControlService.cancelDeletion();
      await refreshUser();
      showToast("Welcome back — account deletion cancelled.");
      nav("/home", { replace: true });
    } catch (err: any) {
      showToast(err.message || "Failed to cancel deletion");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div
      className="screen"
      style={{
        background: "linear-gradient(160deg, #180c02 0%, #1e1104 50%, #100600 100%)",
        color: "#fff",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "10%",
          left: "50%",
          transform: "translateX(-50%)",
          width: "300px",
          height: "300px",
          background: "rgba(245, 158, 11, 0.1)",
          borderRadius: "50%",
          filter: "blur(90px)",
          pointerEvents: "none",
        }}
      />

      <div
        className="screen-scroll page-pad col center-v"
        style={{
          paddingTop: 64,
          paddingBottom: 48,
          alignItems: "center",
          zIndex: 10,
          position: "relative",
          minHeight: "100%",
          justifyContent: "center",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 32, width: "100%" }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 24,
              background: "linear-gradient(135deg, var(--amber-500) 0%, var(--amber-700) 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 10px 30px rgba(217, 119, 6, 0.35)",
              margin: "0 auto 20px",
            }}
          >
            <AlertTriangle size={36} color="#fff" />
          </div>

          <h1 className="h1" style={{ letterSpacing: -0.5, color: "#fff", lineHeight: 1.2 }}>
            {purging || graceEnded ? (
              <>Deleting your account…</>
            ) : (
              <>Account scheduled for deletion</>
            )}
          </h1>

          <p
            style={{
              marginTop: 10,
              fontSize: 14,
              color: "rgba(255, 255, 255, 0.65)",
              maxWidth: 320,
              margin: "10px auto 0",
              lineHeight: 1.5,
            }}
          >
            {purging || graceEnded
              ? "Your grace period has ended. We’re permanently removing your profile and personal data now."
              : "You chose to delete your account. Your profile and listings are hidden from neighbours until you cancel or the grace period ends."}
          </p>
        </div>

        <div
          style={{
            width: "100%",
            background: "rgba(255, 255, 255, 0.04)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: 24,
            padding: 24,
            backdropFilter: "blur(20px)",
            marginBottom: 32,
            textAlign: "center",
            boxShadow: "0 20px 40px rgba(0, 0, 0, 0.35)",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 900,
              background: "rgba(245, 158, 11, 0.15)",
              color: "var(--amber-500)",
              padding: "5px 12px",
              borderRadius: 8,
              letterSpacing: 1,
              textTransform: "uppercase",
              display: "inline-block",
              marginBottom: 16,
            }}
          >
            {purging || graceEnded ? "Purging now" : "Grace period"}
          </div>

          <div style={{ fontSize: 13, color: "rgba(255, 255, 255, 0.8)", lineHeight: 1.6 }}>
            {purging || graceEnded ? (
              <>
                <Loader className="spin" size={18} style={{ display: "inline", verticalAlign: "middle", marginRight: 8 }} />
                Completing deletion — no admin approval required.
              </>
            ) : (
              <>
                Your account will be permanently deleted on <br />
                <strong style={{ color: "var(--amber-500)", fontSize: 15 }}>{deletionDateStr}</strong>
                <span style={{ display: "block", marginTop: 8, fontSize: 13, color: "rgba(255, 255, 255, 0.5)" }}>
                  ({daysRemaining} {daysRemaining === 1 ? "day" : "days"} remaining)
                </span>
              </>
            )}
          </div>

          {!purging && !graceEnded && (
            <>
              <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "20px 0" }} />
              <p style={{ fontSize: 12.5, color: "rgba(255, 255, 255, 0.5)", lineHeight: 1.5 }}>
                Restoring your account cancels deletion and makes your profile visible again immediately.
              </p>
            </>
          )}
        </div>

        <div className="col gap-12" style={{ width: "100%" }}>
          {!purging && !graceEnded && (
            <button
              className="btn btn-primary btn-block row center gap-8"
              onClick={handleCancelDeletion}
              disabled={cancelling}
              style={{
                padding: "16px",
                fontSize: 16,
                fontWeight: 700,
                borderRadius: 16,
                width: "100%",
                background: "linear-gradient(135deg, var(--amber-500) 0%, var(--amber-500) 100%)",
                border: "none",
                color: "#180c02",
                boxShadow: "0 8px 24px rgba(245, 158, 11, 0.2)",
              }}
            >
              {cancelling ? (
                <>
                  <Loader className="spin" size={18} /> Restoring profile…
                </>
              ) : (
                <>
                  Keep account & continue <ArrowRight size={18} />
                </>
              )}
            </button>
          )}

          <button
            onClick={() => {
              signOut();
              nav("/", { replace: true });
            }}
            disabled={purging}
            className="row center gap-6"
            style={{
              width: "100%",
              padding: "14px",
              background: "rgba(255, 255, 255, 0.05)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              color: "rgba(255, 255, 255, 0.7)",
              borderRadius: 16,
              cursor: purging ? "default" : "pointer",
              fontSize: 14,
              fontWeight: 600,
              opacity: purging ? 0.5 : 1,
            }}
          >
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
