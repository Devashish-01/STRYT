import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, LogOut, ArrowRight, Loader } from "lucide-react";
import { useApp } from "@/store";
import { profileControlService } from "@/services/profileControlService";

export default function DeletionPending() {
  const nav = useNavigate();
  const { user, refreshUser, showToast, signOut } = useApp();
  const [cancelling, setCancelling] = useState(false);

  // Calculate days remaining
  const daysRemaining = (() => {
    if (!user.deletionScheduledAt) return 30;
    const purgeDate = new Date(user.deletionScheduledAt);
    const msLeft = purgeDate.getTime() - Date.now();
    return Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));
  })();

  const deletionDateStr = user.deletionScheduledAt
    ? new Date(user.deletionScheduledAt).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "30 days";

  async function handleCancelDeletion() {
    setCancelling(true);
    try {
      await profileControlService.cancelDeletion();
      await refreshUser();
      showToast("Welcome back! Your account deletion has been cancelled. 🎉");
      nav("/home", { replace: true });
    } catch (err: any) {
      showToast(err.message || "Failed to cancel deletion request");
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
      {/* Dynamic warning glow blob */}
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
              background: "linear-gradient(135deg, var(--amber-500) 0%, #d97706 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 10px 30px rgba(217, 119, 6, 0.35)",
              margin: "0 auto 20px",
            }}
          >
            <AlertTriangle size={36} color="#fff" />
          </div>
          
          <h1
            style={{
              fontSize: 26,
              fontWeight: 900,
              letterSpacing: -0.5,
              color: "#fff",
              lineHeight: 1.2,
            }}
          >
            Account Scheduled <br /> for Deletion
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
            You requested to delete your account. Your profile and listings are currently hidden from all neighbors.
          </p>
        </div>

        {/* Warning Information Box */}
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
              color: "#fbbf24",
              padding: "5px 12px",
              borderRadius: 8,
              letterSpacing: 1,
              textTransform: "uppercase",
              display: "inline-block",
              marginBottom: 16,
            }}
          >
            Grace Period Active
          </div>

          <div style={{ fontSize: 13, color: "rgba(255, 255, 255, 0.8)", lineHeight: 1.6 }}>
            Your account will be permanently purged on <br />
            <strong style={{ color: "#fbbf24", fontSize: 15 }}>{deletionDateStr}</strong>
            <span style={{ display: "block", marginTop: 8, fontSize: 13, color: "rgba(255, 255, 255, 0.5)" }}>
              ({daysRemaining} {daysRemaining === 1 ? "day" : "days"} remaining)
            </span>
          </div>

          <div
            style={{
              height: 1,
              background: "rgba(255,255,255,0.08)",
              margin: "20px 0",
            }}
          />

          <p style={{ fontSize: 12.5, color: "rgba(255, 255, 255, 0.5)", lineHeight: 1.5 }}>
            Restoring your account will cancel this deletion request and immediately make your profile and listings visible to your community again.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="col gap-12" style={{ width: "100%" }}>
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
              background: "linear-gradient(135deg, #fbbf24 0%, var(--amber-500) 100%)",
              border: "none",
              color: "#180c02",
              boxShadow: "0 8px 24px rgba(245, 158, 11, 0.2)",
            }}
          >
            {cancelling ? (
              <>
                <Loader className="spin" size={18} /> Restoring Profile...
              </>
            ) : (
              <>
                Keep Account & Continue <ArrowRight size={18} />
              </>
            )}
          </button>

          <button
            onClick={() => {
              signOut();
              nav("/", { replace: true });
            }}
            className="row center gap-6"
            style={{
              width: "100%",
              padding: "14px",
              background: "rgba(255, 255, 255, 0.05)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              color: "rgba(255, 255, 255, 0.7)",
              borderRadius: 16,
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 600,
              transition: "all 0.2s",
            }}
          >
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
