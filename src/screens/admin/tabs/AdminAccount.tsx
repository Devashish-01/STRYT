import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { adminService } from "@/services/core/adminService";
import { KeyRound, LogOut } from "@/components/Icons";
import { useApp } from "@/store";

export function AdminAccount() {
  const nav = useNavigate();
  const { showToast, signOut } = useApp();
  const [newId, setNewId] = useState("");
  const [savingId, setSavingId] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  async function saveId() {
    if (!newId.trim()) return;
    setSavingId(true);
    try {
      await adminService.setAdminLoginId(newId.trim());
      showToast("Admin ID updated");
      setNewId("");
    } catch (e: any) {
      showToast(e?.message || "Couldn't update admin ID.");
    } finally {
      setSavingId(false);
    }
  }

  async function savePassword() {
    if (newPassword.length < 6) { showToast("Password must be at least 6 characters."); return; }
    if (newPassword !== confirmPassword) { showToast("Passwords don't match."); return; }
    setSavingPassword(true);
    try {
      await adminService.changeAdminPassword(newPassword);
      showToast("Password updated");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e: any) {
      showToast(e?.message || "Couldn't update password.");
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="page-pad col gap-16">
      <div className="card">
        <div className="row gap-8 center-v" style={{ marginBottom: 4 }}>
          <KeyRound size={16} color="var(--brand-700)" />
          <span className="semi small">Change admin ID</span>
        </div>
        <p className="tiny muted" style={{ marginBottom: 10 }}>This is the ID typed on the admin sign-in screen — not visible to customers.</p>
        <div className="row gap-8">
          <input className="input grow" placeholder="New admin ID" value={newId} onChange={(e) => setNewId(e.target.value)} />
          <button className="btn btn-primary btn-sm" disabled={!newId.trim() || savingId} onClick={saveId}>
            {savingId ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="row gap-8 center-v" style={{ marginBottom: 4 }}>
          <KeyRound size={16} color="var(--brand-700)" />
          <span className="semi small">Change password</span>
        </div>
        <p className="tiny muted" style={{ marginBottom: 10 }}>Minimum 6 characters.</p>
        <div className="col gap-8">
          <input type="password" className="input" placeholder="New password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          <input type="password" className="input" placeholder="Confirm new password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          <button className="btn btn-primary btn-sm btn-block" disabled={!newPassword || savingPassword} onClick={savePassword}>
            {savingPassword ? "Saving…" : "Update password"}
          </button>
        </div>
      </div>

      <button
        className="btn btn-outline btn-block row gap-8 center"
        style={{ color: "var(--red-600)", borderColor: "var(--red-100)" }}
        onClick={() => { signOut(); nav("/admin/login"); }}
      >
        <LogOut size={16} /> Sign out of admin
      </button>
    </div>
  );
}
