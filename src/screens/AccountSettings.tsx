import { useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { AppBar } from "@/components/common";
import { Globe, Shield, HelpCircle, Bug, LogOut, ChevronRight, UserCircle, Key, MapPin } from "@/components/Icons";
import { useApp } from "@/store";
import { APK_DOWNLOAD_URL, APK_FILENAME } from "@/lib/apkDownload";

/**
 * The customer's "account & settings" hub — a management page (like the
 * business/provider dashboards) that collects the functions people don't touch
 * daily, so the main Profile screen stays focused on frequent actions.
 */
export default function AccountSettings() {
  const nav = useNavigate();
  const { user, signOut } = useApp();

  // The admin-console entry point is gated on the real DB `roles` claim only
  // (Security Audit M-1) — a client-side env/localStorage bypass would be
  // readable/settable by anyone, and every real admin action is already
  // re-checked server-side (role + audit log) regardless of this UI gate.
  const isAdmin =
    (user.roles as string[]).includes("admin") ||
    (user.roles as string[]).includes("super_admin");

  return (
    <div className="screen screen-boxed">
      <AppBar title="Account & settings" />
      <div className="screen-scroll page-pad col gap-16" style={{ paddingTop: 14, paddingBottom: 30 }}>

        <Section title="Account">
          <MenuRow icon={<UserCircle size={20} color="var(--brand-600)" />} label="Public profile" hint="How others see you" onClick={() => nav(`/u/${user.id}`)} />
          <MenuRow icon={<Key size={20} color="var(--orange-500)" />} label="Business access" hint="Remote login & sessions" onClick={() => nav("/account/business-access")} last />
        </Section>

        <Section title="Safety">
          <MenuRow icon={<MapPin size={20} color="var(--accent-600)" />} label="Live location & contacts" hint="Share your location with people you trust" onClick={() => nav("/safety")} last />
        </Section>

        <Section title="Preferences">
          <MenuRow icon={<Globe size={20} color="var(--blue-500)" />} label="Language" hint="English" onClick={() => nav("/settings")} />
          <MenuRow icon={<Shield size={20} color="var(--green-500)" />} label="Privacy & safety" onClick={() => nav("/settings")} last />
        </Section>

        <Section title="Support">
          <MenuRow icon={<HelpCircle size={20} color="var(--blue-500)" />} label="Help & support" onClick={() => nav("/support?tab=contact")} />
          <MenuRow icon={<Bug size={20} color="var(--red-500)" />} label="Report a bug" onClick={() => nav("/support?tab=bug")} last={!isAdmin} />
          {isAdmin && (
            <MenuRow icon={<Shield size={20} color="var(--ink-900)" />} label="Admin console" onClick={() => nav("/admin")} last />
          )}
        </Section>

        {!Capacitor.isNativePlatform() && (
          <Section title="App">
            <MenuRow
              icon={<span style={{ fontSize: 20 }}>🤖</span>}
              label="Download Android app"
              hint="Get the .apk file"
              onClick={() => {
                const link = document.createElement("a");
                link.href = APK_DOWNLOAD_URL;
                link.download = APK_FILENAME;
                link.click();
              }}
              last
            />
          </Section>
        )}

        <button className="btn btn-block row center gap-8" style={{ color: "var(--red-600)", background: "var(--red-50)", border: "1px solid var(--red-100)" }} onClick={() => { signOut(); nav("/"); }}>
          <LogOut size={18} /> Log out
        </button>

        <p className="tiny muted" style={{ textAlign: "center", padding: "4px 0" }}>STRYT v0.1.0 · Made for your street</p>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="col gap-6">
      <span className="tiny bold muted" style={{ textTransform: "uppercase", letterSpacing: 0.8, fontSize: 9 }}>{title}</span>
      <div className="card" style={{ overflow: "hidden", padding: 0 }}>{children}</div>
    </div>
  );
}

function MenuRow({ icon, label, hint, onClick, last }: { icon: React.ReactNode; label: string; hint?: string; onClick: () => void; last?: boolean }) {
  return (
    <button className="row gap-12" style={{ width: "100%", padding: "14px 16px", borderBottom: last ? "none" : "1px solid var(--line)" }} onClick={onClick}>
      {icon}
      <span className="semi grow" style={{ textAlign: "left", fontSize: 15 }}>{label}</span>
      {hint && <span className="tiny muted">{hint}</span>}
      <ChevronRight size={18} color="var(--ink-300)" />
    </button>
  );
}
