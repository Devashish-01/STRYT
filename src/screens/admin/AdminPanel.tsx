import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AppBar, EmptyState } from "@/components/common";
import { adminService, type AdminReport, type VerificationQueueItem, type PendingLocationChange } from "@/services/core/adminService";
import { profileControlService, type DeletionRequest } from "@/services/core/profileControlService";
import { ACCOUNT_DELETION_GRACE_DAYS } from "@/lib/accountDeletion";
import { notificationService } from "@/services/engagement/notificationService";
import { appealService, type AccountAppeal } from "@/services/core/appealService";
import { useQuery, useQueryWithRealtime } from "@/hooks/useApi";
import { Skeleton, ListSkeleton } from "@/components/states";
import { Shield, Check, X, Store, Briefcase, Tag, Flag, Users, TrendingUp, AlertTriangle, KeyRound, LogOut, Eye, ExternalLink, MapPin, Mountains } from "@/components/Icons";
import MiniMap from "@/components/MiniMap";
import PlaceRequestForm from "@/screens/places/PlaceRequestForm";
import { useApp } from "@/store";
import { getSupabase } from "@/lib/supabaseClient";

import type { Tab } from "./types";

import { AdminAccount } from "./tabs/AdminAccount";
import { AdminDashboard } from "./tabs/AdminDashboard";
import { AdminQueue } from "./tabs/AdminQueue";
import { AdminVerificationQueue } from "./tabs/AdminVerificationQueue";
import { AdminLocationChanges } from "./tabs/AdminLocationChanges";
import { AdminReports } from "./tabs/AdminReports";
import { AdminBugs } from "./tabs/AdminBugs";
import { AdminDisputes } from "./tabs/AdminDisputes";
import { AdminAppeals } from "./tabs/AdminAppeals";
import { AdminProfiles } from "./tabs/AdminProfiles";
import { errorMessage } from "@/lib/errorMessage";

export default function AdminPanel() {
  const nav = useNavigate();
  const { user, showToast, refreshUser } = useApp();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [claiming, setClaiming] = useState(false);

  const isAdmin =
    (user.roles as string[]).includes("admin") ||
    (user.roles as string[]).includes("super_admin");

  async function claimFirstAdmin() {
    setClaiming(true);
    try {
      await adminService.claimFirstAdmin("admin");
      showToast("Admin access granted — welcome!");
      // Re-fetch the profile so the new admin role flows into the store and the
      // panel re-renders in place — no jarring full-page reload.
      await refreshUser();
    } catch (e) {
      showToast(errorMessage(e, "Couldn't claim admin access."));
    } finally {
      setClaiming(false);
    }
  }

  if (!isAdmin) {
    return (
      <div className="screen">
        <div className="screen-scroll col center page-pad" style={{ paddingTop: 100, textAlign: "center" }}>
          <div style={{ width: 80, height: 80, borderRadius: 20, background: "var(--ink-200)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Shield size={40} color="var(--red-600)" />
          </div>
          <h1 className="bold h1" style={{ marginTop: 20 }}>Access Denied</h1>
          <p className="muted small" style={{ marginTop: 8 }}>Only verified administrators can access this console.</p>

          <div className="col gap-8" style={{ marginTop: 24, width: "100%", maxWidth: 280 }}>
            <button className="btn btn-primary" onClick={() => nav("/admin/login")}>
              Sign in as admin
            </button>
            {import.meta.env.DEV && (
              <>
                <button className="btn btn-outline" disabled={claiming} onClick={claimFirstAdmin}>
                  {claiming ? "Claiming…" : "Claim first-admin access (dev only)"}
                </button>
                <p className="tiny muted" style={{ lineHeight: 1.5 }}>
                  Dev builds only — bootstrap production admins out-of-band before launch.
                </p>
              </>
            )}
          </div>

          <button className="btn btn-dark" style={{ marginTop: 16, width: "100%", maxWidth: 200 }} onClick={() => nav("/home")}>Back to Home</button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <AppBar title="Admin Console" subtitle="Moderation & ops" onBack={() => nav("/profile")} />
      <div className="row" style={{ borderBottom: "1px solid var(--line)", background: "#fff", overflowX: "auto" }}>
        {([["dashboard", "Overview"], ["queue", "Queue"], ["verification", "Verification"], ["location", "Location changes"], ["disputes", "Disputes"], ["appeals", "Appeals"], ["reports", "Reports"], ["bugs", "Bugs"], ["profiles", "Profiles"], ["account", "Account"]] as [Tab, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} className="semi" style={{ flex: "1 0 auto", padding: "12px 14px", fontSize: 13.5, color: tab === t ? "var(--brand-700)" : "var(--ink-500)", borderBottom: tab === t ? "2.5px solid var(--brand-700)" : "2.5px solid transparent" }}>{label}</button>
        ))}
      </div>
      <div className="screen-scroll">
        {tab === "dashboard" && <AdminDashboard />}
        {tab === "queue" && <AdminQueue />}
        {tab === "verification" && <AdminVerificationQueue />}
        {tab === "location" && <AdminLocationChanges />}
        {tab === "disputes" && <AdminDisputes />}
        {tab === "appeals" && <AdminAppeals />}
        {tab === "reports" && <AdminReports />}
        {tab === "bugs" && <AdminBugs />}
        {tab === "profiles" && <AdminProfiles />}
        {tab === "account" && <AdminAccount />}
      </div>
    </div>
  );
}
