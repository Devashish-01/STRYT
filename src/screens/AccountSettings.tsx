import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { AppBar } from "@/components/common";
import { SettingsSection, SettingsRow } from "@/components/settings";
import {
  Globe, Shield, HelpCircle, Bug, LogOut, UserCircle, Key, MapPin, BookOpen,
  FileText, Bell, Lock, Search, Users, Pencil, Download, Trash2,
} from "@/components/Icons";
import { useApp } from "@/store";
import { useI18n, LANG_LABELS } from "@/lib/i18n";
import { APK_DOWNLOAD_URL, APK_FILENAME } from "@/lib/apkDownload";

interface Row {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  value?: string;
  onClick: () => void;
  danger?: boolean;
  /** Extra words this row should match on when searching. */
  keywords?: string;
}

/**
 * The customer's settings hub. Every row here opens a screen whose title is
 * that row's label — previously "Language" and "Privacy & safety" were
 * different labels pointing at the same undifferentiated /settings page, both
 * landing at its top, several sections above the thing they named.
 */
export default function AccountSettings() {
  const nav = useNavigate();
  const { user, signOut, ownedBusinessIds, ownedProviderId } = useApp();
  const { lang } = useI18n();
  const [q, setQ] = useState("");

  // The admin-console entry point is gated on the real DB `roles` claim only
  // (Security Audit M-1) — a client-side env/localStorage bypass would be
  // readable/settable by anyone, and every real admin action is already
  // re-checked server-side (role + audit log) regardless of this UI gate.
  const isAdmin =
    (user.roles as string[]).includes("admin") ||
    (user.roles as string[]).includes("super_admin");

  // Entity passwords only exist for people who actually sell something.
  const hasHats = ownedBusinessIds.length > 0 || !!ownedProviderId;

  const groups: { title: string; rows: Row[] }[] = useMemo(() => [
    {
      title: "Account",
      rows: [
        { icon: <UserCircle size={19} color="var(--brand-600)" />, label: "Public profile", hint: "How neighbours see you", onClick: () => nav(`/u/${user.id}`) },
        { icon: <Pencil size={19} color="var(--brand-600)" />, label: "Edit profile", hint: "Name, handle, photo, area", onClick: () => nav("/profile/edit") },
        { icon: <Key size={19} color="var(--orange-500)" />, label: "Team & access", hint: "Add team members", keywords: "business delegate staff", onClick: () => nav("/account/business-access") },
      ],
    },
    {
      title: "Preferences",
      rows: [
        { icon: <Bell size={19} color="var(--accent-600)" />, label: "Notifications", hint: "What you're alerted about, and how far", keywords: "alerts push radius sound quiet", onClick: () => nav("/settings/notifications") },
        { icon: <Shield size={19} color="var(--green-500)" />, label: "Privacy & visibility", hint: "What neighbours can see about you", keywords: "public private hide name phone", onClick: () => nav("/settings/privacy") },
        { icon: <Search size={19} color="var(--brand-600)" />, label: "Discovery", hint: "What shows up in your feeds & map", keywords: "providers feed data saver", onClick: () => nav("/settings/discovery") },
        { icon: <Globe size={19} color="var(--blue-500)" />, label: "Language", value: LANG_LABELS[lang], keywords: "english hindi marathi भाषा", onClick: () => nav("/settings/language") },
      ],
    },
    {
      title: "Safety",
      rows: [
        { icon: <Users size={19} color="var(--accent-600)" />, label: "My People", hint: "Share your live location instantly", keywords: "emergency contacts", onClick: () => nav("/safety") },
        { icon: <MapPin size={19} color="var(--pink-600)" />, label: "Location sharing", hint: "Who can see where you are", keywords: "requests shares revoke", onClick: () => nav("/settings/location") },
      ],
    },
    ...(hasHats ? [{
      title: "Security",
      rows: [
        { icon: <Lock size={19} color="var(--ink-700)" />, label: "Console password", hint: "Protect your business / provider console", keywords: "pin recovery backup question", onClick: () => nav("/settings/security") },
      ],
    }] : []),
    {
      title: "Support",
      rows: [
        { icon: <BookOpen size={19} color="var(--brand-600)" />, label: "Guide & FAQ", hint: "Quick answers, self-serve", onClick: () => nav("/guide") },
        { icon: <HelpCircle size={19} color="var(--blue-500)" />, label: "Help & support", hint: "Talk to a human", onClick: () => nav("/support?tab=contact") },
        { icon: <Bug size={19} color="var(--red-500)" />, label: "Report a bug", onClick: () => nav("/support?tab=bug") },
        { icon: <FileText size={19} color="var(--ink-600)" />, label: "Legal & policies", hint: "Terms, privacy & more", onClick: () => nav("/legal") },
      ],
    },
    ...(isAdmin ? [{
      title: "Admin",
      rows: [
        { icon: <Shield size={19} color="var(--ink-900)" />, label: "Admin console", onClick: () => nav("/admin") },
      ],
    }] : []),
    ...(!Capacitor.isNativePlatform() ? [{
      title: "App",
      rows: [
        {
          icon: <Download size={19} color="var(--green-600)" />,
          label: "Download Android app",
          hint: "Get the .apk file",
          keywords: "apk install native",
          onClick: () => {
            const link = document.createElement("a");
            link.href = APK_DOWNLOAD_URL;
            link.download = APK_FILENAME;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          },
        },
      ],
    }] : []),
    {
      title: "Your data",
      rows: [
        { icon: <Download size={19} color="var(--ink-600)" />, label: "Download my data", hint: "A copy of everything you've saved here", keywords: "export gdpr backup json", onClick: () => nav("/settings/data") },
        { icon: <Trash2 size={19} color="var(--red-600)" />, label: "Delete account", hint: "Permanently close your account", danger: true, keywords: "close remove erase", onClick: () => nav("/settings/data?action=delete") },
      ],
    },
  ], [nav, user.id, lang, isAdmin, hasHats]);

  // Search filters rows by label, hint and keywords — the single thing that
  // keeps a settings tree usable as it grows, instead of making people
  // remember which of eight screens a switch lives on.
  const needle = q.trim().toLowerCase();
  const filtered = needle
    ? groups
        .map((g) => ({ ...g, rows: g.rows.filter((r) => `${r.label} ${r.hint ?? ""} ${r.keywords ?? ""} ${g.title}`.toLowerCase().includes(needle)) }))
        .filter((g) => g.rows.length > 0)
    : groups;

  return (
    <div className="screen screen-boxed">
      <AppBar title="Settings" />
      <div className="screen-scroll page-pad col gap-16 scroll-pad-end" style={{ paddingTop: 14 }}>

        <div className="field" style={{ marginBottom: 0 }}>
          <input
            className="input"
            type="search"
            placeholder="Search settings"
            aria-label="Search settings"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {filtered.length === 0 ? (
          <p className="small muted" style={{ textAlign: "center", padding: "24px 0" }}>
            Nothing matches “{q.trim()}”.
          </p>
        ) : (
          filtered.map((g) => (
            <SettingsSection key={g.title} title={g.title}>
              {g.rows.map((r) => (
                <SettingsRow
                  key={r.label}
                  icon={r.icon}
                  label={r.label}
                  hint={r.hint}
                  value={r.value}
                  danger={r.danger}
                  onClick={r.onClick}
                />
              ))}
            </SettingsSection>
          ))
        )}

        <button className="btn btn-block row center gap-8" style={{ color: "var(--red-600)", background: "var(--red-50)", border: "1px solid var(--red-100)" }} onClick={() => { signOut(); nav("/"); }}>
          <LogOut size={18} /> Log out
        </button>

        <p className="tiny muted" style={{ textAlign: "center", padding: "4px 0" }}>STRYT v{__APP_VERSION__} · Made for your street</p>
      </div>
    </div>
  );
}
