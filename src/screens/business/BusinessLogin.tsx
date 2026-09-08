import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppBar } from "@/components/common";
import { Key, Clock, CheckCircle2 } from "@/components/Icons";
import { businessAccessService } from "@/services";
import { useApp } from "@/store";
import { haptics } from "@/lib/haptics";

/**
 * The staff half of the shared shop login (TEAM_ACCESS #1).
 *
 * `businessAccessService.login` — and the whole rate-limited, bcrypt-backed
 * `business_login_attempt` behind it — had no caller anywhere in the app, so the
 * owner-facing half was equally pointless: a login id nobody could use.
 *
 * This is deliberately NOT a second way to authenticate. The RPC raises
 * UNAUTHENTICATED without a session, because staff sign in to STRYT as
 * themselves first and this only decides which shop they can open. That's what
 * keeps `business_access_sessions.grantee_user_id` a real person rather than a
 * shared account, which is the whole basis of the owner's roster and history.
 */
export default function BusinessLogin() {
  const nav = useNavigate();
  const { showToast, setContext, refreshUser } = useApp();

  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  /** Set when the owner requires approval — the session exists but isn't usable
   *  yet. A toast would have been the wrong shape for this: it's a state to sit
   *  in, not an event that just happened. */
  const [awaiting, setAwaiting] = useState<{ businessName: string } | null>(null);

  async function submit() {
    if (!loginId.trim() || !password) return;
    setBusy(true);
    try {
      const res = await businessAccessService.login(loginId.trim(), password);
      haptics.success();
      if (res.status === "PENDING") {
        setAwaiting({ businessName: res.businessName });
        setPassword("");
        return;
      }
      // ACTIVE — the grant is live, so put the hat on and go.
      setContext({ type: "business", id: res.businessId, name: res.businessName });
      // The console's guard reads owned/delegated ids off the store; without
      // this it can bounce a session that was granted seconds ago.
      await refreshUser();
      showToast(`Signed in to ${res.businessName}`);
      nav(`/business/${res.businessId}/manage`, { replace: true });
    } catch (e: any) {
      // login() already turns the RPC's statuses into readable reasons —
      // invalid credentials, and the lockout message with its own countdown.
      showToast(e?.message || "Couldn't sign in");
      setPassword("");
    } finally {
      setBusy(false);
    }
  }

  if (awaiting) {
    return (
      <div className="screen screen-boxed">
        <AppBar title="Shop login" onBack={() => nav(-1)} />
        <div className="screen-scroll col center page-pad" style={{ paddingTop: 64, textAlign: "center" }}>
          <div style={{ width: 88, height: 88, borderRadius: "50%", background: "var(--amber-50)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Clock size={40} color="var(--amber-700)" />
          </div>
          <h1 className="bold h1" style={{ marginTop: 22 }}>Waiting for approval</h1>
          <p className="muted" style={{ marginTop: 8, lineHeight: 1.5, maxWidth: 300 }}>
            {awaiting.businessName} asks the owner to approve each sign-in. They've been
            sent your request — once they accept, the shop appears under
            Team &amp; access and you can open it from there.
          </p>
        </div>
        <div className="page-pad col gap-10">
          <button className="btn btn-primary btn-block" onClick={() => nav("/account/business-access")}>
            Go to Team &amp; access
          </button>
          <button className="btn btn-ghost btn-block" onClick={() => nav("/home")}>Back to home</button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen screen-boxed">
      <AppBar title="Shop login" subtitle="Open a shop you work at" onBack={() => nav(-1)} />
      <div className="screen-scroll page-pad col gap-16" style={{ paddingTop: 18 }}>
        <div className="col center" style={{ gap: 10, textAlign: "center", padding: "8px 0 4px" }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--brand-50)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Key size={28} color="var(--brand-700)" />
          </div>
          <p className="small muted" style={{ lineHeight: 1.5, maxWidth: 320, margin: 0 }}>
            Ask the owner for the shop's login id and password. You stay signed in as
            yourself — this only decides which shop you can open.
          </p>
        </div>

        <div className="field">
          <label>Login id</label>
          <input
            className="input"
            value={loginId}
            autoCapitalize="none"
            autoCorrect="off"
            placeholder="e.g. spiceroute-kitchen"
            onChange={(e) => setLoginId(e.target.value.toLowerCase().replace(/\s/g, ""))}
          />
        </div>

        <div className="field">
          <label>Password</label>
          <input
            className="input"
            type="password"
            value={password}
            autoCapitalize="none"
            autoComplete="off"
            placeholder="Shop password"
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
          />
        </div>

        <button className="btn btn-primary btn-block" disabled={busy || !loginId.trim() || !password} onClick={submit}>
          {busy ? "Signing in…" : "Open shop"}
        </button>

        <div className="card row gap-10" style={{ padding: 12, alignItems: "flex-start" }}>
          <CheckCircle2 size={18} color="var(--green-500)" style={{ flexShrink: 0, marginTop: 1 }} />
          <span className="tiny muted" style={{ lineHeight: 1.45 }}>
            Already been added by name? You don't need this — the shop is already under
            <button
              className="semi"
              style={{ color: "var(--brand-700)", background: "none", border: "none", padding: "0 3px", cursor: "pointer", font: "inherit" }}
              onClick={() => nav("/account/business-access")}
            >
              Team &amp; access
            </button>
            .
          </span>
        </div>
      </div>
    </div>
  );
}
