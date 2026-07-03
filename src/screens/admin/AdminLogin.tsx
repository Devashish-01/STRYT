import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, Lock, User, Loader, ArrowRight } from "lucide-react";
import { authService } from "@/services";
import { resolveAdminEmail } from "@/lib/adminAuth";
import { useApp } from "@/store";
import { returnTo } from "@/lib/returnTo";

export default function AdminLogin() {
  const nav = useNavigate();
  const { showToast, signIn } = useApp();
  const [adminId, setAdminId] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!adminId.trim() || !password) return;
    setLoading(true);
    try {
      const email = await resolveAdminEmail(adminId);
      if (!email) {
        // Same generic error whether the ID doesn't exist or the password is
        // wrong — never reveal which, so the login can't be used to enumerate
        // valid admin IDs.
        showToast("Invalid admin ID or password.");
        return;
      }
      const res = await authService.signInWithPassword(email, password);
      if (res.hasSession) {
        signIn();
        const dest = returnTo.consume();
        nav(dest === "/home" ? "/admin" : dest, { replace: true });
      } else {
        showToast("This admin account isn't confirmed yet — check its email inbox.");
      }
    } catch {
      showToast("Invalid admin ID or password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="screen"
      style={{
        background: "linear-gradient(160deg, #0f0d17 0%, #1a1625 60%, #14111c 100%)",
        color: "#fff",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "24px 20px",
      }}
    >
      <div className="col center" style={{ marginBottom: 32 }}>
        <div
          style={{
            width: 56, height: 56, borderRadius: 16,
            background: "linear-gradient(135deg, #7c3aed, #4c1d95)",
            display: "flex", alignItems: "center", justifyContent: "center",
            marginBottom: 16, boxShadow: "0 8px 24px rgba(124,58,237,0.35)",
          }}
        >
          <Shield size={28} color="#fff" />
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>Admin Console</h1>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginTop: 4 }}>Restricted access — authorized administrators only</p>
      </div>

      <div className="col gap-12" style={{ maxWidth: 340, width: "100%", margin: "0 auto" }}>
        <div
          className="row"
          style={{ background: "rgba(255,255,255,0.06)", border: "1.5px solid rgba(255,255,255,0.12)", borderRadius: 14, overflow: "hidden", alignItems: "center" }}
        >
          <span style={{ paddingLeft: 14, display: "flex", color: "rgba(255,255,255,0.4)" }}><User size={16} /></span>
          <input
            className="input"
            style={{ border: "none", background: "transparent", flex: 1, padding: "14px", fontSize: 15, color: "#fff", outline: "none" }}
            placeholder="Admin ID"
            value={adminId}
            onChange={(e) => setAdminId(e.target.value)}
            disabled={loading}
            autoCapitalize="none"
            autoFocus
          />
        </div>
        <div
          className="row"
          style={{ background: "rgba(255,255,255,0.06)", border: "1.5px solid rgba(255,255,255,0.12)", borderRadius: 14, overflow: "hidden", alignItems: "center" }}
        >
          <span style={{ paddingLeft: 14, display: "flex", color: "rgba(255,255,255,0.4)" }}><Lock size={16} /></span>
          <input
            type="password"
            className="input"
            style={{ border: "none", background: "transparent", flex: 1, padding: "14px", fontSize: 15, color: "#fff", outline: "none" }}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            onKeyDown={(e) => { if (e.key === "Enter") handleLogin(); }}
          />
        </div>

        <button
          onClick={handleLogin}
          disabled={!adminId.trim() || !password || loading}
          className="row center gap-8"
          style={{
            marginTop: 8, padding: 15, borderRadius: 14, border: "none",
            background: "linear-gradient(135deg, #7c3aed, #6d28d9)", color: "#fff",
            fontWeight: 700, fontSize: 15, cursor: "pointer", opacity: (!adminId.trim() || !password) ? 0.5 : 1,
          }}
        >
          {loading ? <Loader className="spin" size={18} /> : <>Sign In <ArrowRight size={16} /></>}
        </button>

        <button
          onClick={() => nav("/home")}
          style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 12.5, marginTop: 8, cursor: "pointer" }}
        >
          ← Back to STRYT
        </button>
      </div>
    </div>
  );
}
