import { useState, useEffect } from "react";
import { AppBar } from "@/components/common";
import { Moon, Volume2, Globe, Shield, Eye, Pencil } from "lucide-react";
import { useApp } from "@/store";
import { userService, profileControlService } from "@/services";
import { useI18n, LANG_LABELS, type Lang } from "@/lib/i18n";
import RadiusSelector from "@/components/RadiusSelector";


function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      style={{
        width: 46,
        height: 28,
        borderRadius: 999,
        background: on ? "var(--brand-600)" : "var(--ink-200)",
        position: "relative",
        transition: "background 0.2s",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 3,
          left: on ? 21 : 3,
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: "#fff",
          transition: "left 0.2s",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
        }}
      />
    </button>
  );
}

export default function Settings() {
  const { user, refreshUser, showToast } = useApp();
  const [silent, setSilent] = useState(() => localStorage.getItem("settings_silent") !== "false");
  const [quiet, setQuiet] = useState(() => localStorage.getItem("settings_quiet") !== "false");
  const [newBiz, setNewBiz] = useState(() => localStorage.getItem("settings_new_biz") !== "false");
  const [newProv, setNewProv] = useState(() => localStorage.getItem("settings_new_prov") !== "false");
  const [reqs, setReqs] = useState(() => localStorage.getItem("settings_reqs") !== "false");
  const [offers, setOffers] = useState(() => localStorage.getItem("settings_offers") !== "false");
  const [approx, setApprox] = useState(() => localStorage.getItem("settings_approx") !== "false");
  const [showPosts, setShowPosts] = useState(() => {
    const saved = localStorage.getItem("settings_show_posts");
    return saved !== null ? saved === "true" : (user.showPostsPublicly ?? true);
  });
  const [showAsks, setShowAsks] = useState(() => {
    const saved = localStorage.getItem("settings_show_asks");
    return saved !== null ? saved === "true" : (user.showAsksPublicly ?? true);
  });
  const [showBadges, setShowBadges] = useState(() => {
    const saved = localStorage.getItem("settings_show_badges");
    return saved !== null ? saved === "true" : (user.showBadgesPublicly ?? true);
  });
  const [radius, setRadius] = useState(() => {
    const saved = localStorage.getItem("settings_radius");
    return saved ? Number(saved) : (user.notificationRadiusKm || 5);
  });

  const [customerEnabled, setCustomerEnabled] = useState(user.customerEnabled !== false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [submittingDelete, setSubmittingDelete] = useState(false);

  async function handleToggleCustomerEnabled(v: boolean) {
    setCustomerEnabled(v);
    try {
      await profileControlService.setEnabled("CUSTOMER", null, v);
      showToast(v ? "Customer profile is now visible" : "Customer profile hidden from discovery");
      void refreshUser();
    } catch (err: any) {
      setCustomerEnabled(!v);
      showToast(err.message || "Failed to update visibility");
    }
  }

  async function handleSubmitDeleteRequest() {
    if (!deleteReason.trim()) {
      showToast("Please provide a reason for deletion");
      return;
    }
    setSubmittingDelete(true);
    try {
      await profileControlService.requestDeletion("CUSTOMER", null, deleteReason);
      showToast("Deletion request submitted to administrators");
      setShowDeleteModal(false);
      setDeleteReason("");
    } catch (err: any) {
      showToast(err.message || "Failed to submit request");
    } finally {
      setSubmittingDelete(false);
    }
  }



  useEffect(() => {
    localStorage.setItem("settings_silent", String(silent));
  }, [silent]);

  useEffect(() => {
    localStorage.setItem("settings_quiet", String(quiet));
  }, [quiet]);

  useEffect(() => {
    localStorage.setItem("settings_new_biz", String(newBiz));
  }, [newBiz]);

  useEffect(() => {
    localStorage.setItem("settings_new_prov", String(newProv));
  }, [newProv]);

  useEffect(() => {
    localStorage.setItem("settings_reqs", String(reqs));
  }, [reqs]);

  useEffect(() => {
    localStorage.setItem("settings_offers", String(offers));
  }, [offers]);

  useEffect(() => {
    localStorage.setItem("settings_approx", String(approx));
  }, [approx]);

  useEffect(() => {
    localStorage.setItem("settings_radius", String(radius));
    if (user.id && radius !== user.notificationRadiusKm) {
      void userService.update({ notificationRadiusKm: radius }).catch(() => {});
    }
  }, [radius, user.id, user.notificationRadiusKm]);

  function handleTogglePosts(v: boolean) {
    setShowPosts(v);
    localStorage.setItem("settings_show_posts", String(v));
    showToast(v ? "Posts are now visible on public profile" : "Posts hidden on public profile");
    void userService.update({ showPostsPublicly: v }).catch(() => {});
  }

  function handleToggleAsks(v: boolean) {
    setShowAsks(v);
    localStorage.setItem("settings_show_asks", String(v));
    showToast(v ? "Service requests visible on public profile" : "Service requests hidden on public profile");
    void userService.update({ showAsksPublicly: v }).catch(() => {});
  }

  function handleToggleBadges(v: boolean) {
    setShowBadges(v);
    localStorage.setItem("settings_show_badges", String(v));
    showToast(v ? "Badges visible on public profile" : "Badges hidden on public profile");
    void userService.update({ showBadgesPublicly: v }).catch(() => {});
  }

  const { lang, setLang } = useI18n();
  const langs = Object.entries(LANG_LABELS) as [Lang, string][];

  return (
    <div className="screen">
      <AppBar title="Settings" />
      <div className="screen-scroll page-pad col gap-16" style={{ paddingBottom: 40 }}>
        {/* Notification Radius */}
        <div>
          <RadiusSelector
            value={radius}
            onChange={setRadius}
            accentColor="var(--brand-600)"
            label="Notification radius"
            description="How far away you want to receive alerts and discover things."
          />
        </div>

        {/* Notifications */}
        <div>
          <div className="small semi muted" style={{ marginBottom: 8 }}>Notifications</div>
          <div className="card">
            <Row icon={<Moon size={18} color="#6366f1" />} label="Silent notifications" hint="Badge only, no sound" on={silent} set={setSilent} />
            <Row icon={<Volume2 size={18} color="var(--amber-500)" />} label="Quiet hours (10 PM–7 AM)" on={quiet} set={setQuiet} />
            <div className="divider" style={{ margin: 0 }} />
            <Row label="New businesses nearby" on={newBiz} set={setNewBiz} />
            <Row label="Show nearby providers" hint="Hide providers from your discovery feeds & map (They can still see and quote your requests)" on={newProv} set={setNewProv} />
            <Row label="Nearby requests" on={reqs} set={setReqs} />
            <Row label="Offers & deals" on={offers} set={setOffers} last />
          </div>
        </div>

        {/* Privacy */}
        <div>
          <div className="small semi muted" style={{ marginBottom: 8 }}>Privacy & safety</div>
          <div className="card">
            <Row icon={<Eye size={18} color="var(--green-500)" />} label="Show approximate location" hint="Exact only after agreement" on={approx} set={setApprox} />
            <div className="divider" style={{ margin: 0 }} />
            <Row label="Show Posts publicly" hint="Allow neighbors to see your community posts on your profile" on={showPosts} set={handleTogglePosts} />
            <Row label="Show Service Requests publicly" hint="Allow neighbors to see your open & past asks" on={showAsks} set={handleToggleAsks} />
            <Row label="Show Badges publicly" hint="Show trust badges & verifications on your profile" on={showBadges} set={handleToggleBadges} />
            <Row label="Show customer profile publicly" hint="When disabled, you are hidden from search and leaderboards" on={customerEnabled} set={handleToggleCustomerEnabled} last />
          </div>
        </div>

        {/* Language */}
        <div>
          <div className="small semi muted row gap-6" style={{ marginBottom: 8 }}><Globe size={14} /> Language</div>
          <div className="row gap-8">
            {langs.map(([code, label]) => (
              <button
                key={code}
                className={`chip ${lang === code ? "active" : ""}`}
                onClick={() => {
                  setLang(code as Lang);
                  showToast(`Language set to ${label}`);
                  void userService.update({ language: code }).catch(() => {});
                }}
                style={{ flex: 1, justifyContent: "center" }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Account Deletion */}
        <div>
          <div className="small semi muted" style={{ marginBottom: 8 }}>Account Actions</div>
          <div className="card col gap-10" style={{ padding: 14 }}>
            <span className="tiny muted">
              Request permanent deletion of your profile and data. This requires administrator verification.
            </span>
            <button className="btn btn-outline btn-sm" onClick={() => setShowDeleteModal(true)} style={{ color: "var(--red-600)", borderColor: "var(--red-200)", width: "100%" }}>
              Request Account Deletion
            </button>
          </div>
        </div>

        <div className="card" style={{ padding: 14, background: "var(--brand-50)", border: "1px solid var(--brand-100)" }}>
          <div className="row gap-8 small" style={{ color: "var(--brand-700)" }}>
            <Shield size={18} />
            <span>Your data is yours. We store only your last location, never a trail. Request deletion anytime.</span>
          </div>
        </div>
      </div>

      {showDeleteModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div className="card col gap-12" style={{ maxWidth: 400, width: "100%", padding: 16, background: "var(--ink-50)", boxShadow: "var(--shadow-lg)" }}>
            <h3 className="bold" style={{ fontSize: 18 }}>Request Deletion</h3>
            <p className="tiny muted">Explain why you would like to permanently delete your customer account. An administrator will review your request shortly.</p>
            <textarea
              className="input"
              placeholder="Reason for deletion request..."
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              style={{ minHeight: 80, width: "100%", padding: 10, borderRadius: 8, border: "1px solid var(--line)", background: "transparent", color: "inherit" }}
            />
            <div className="row gap-10" style={{ marginTop: 10 }}>
              <button className="btn btn-outline btn-sm grow" onClick={() => setShowDeleteModal(false)} disabled={submittingDelete}>Cancel</button>
              <button className="btn btn-red btn-sm grow" onClick={handleSubmitDeleteRequest} disabled={submittingDelete}>
                {submittingDelete ? "Submitting..." : "Submit Request"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ icon, label, hint, on, set, last }: { icon?: React.ReactNode; label: string; hint?: string; on: boolean; set: (v: boolean) => void; last?: boolean }) {
  return (
    <div className="row gap-12" style={{ padding: "13px 14px", borderBottom: last ? "none" : "1px solid var(--line)" }}>
      {icon}
      <div className="grow">
        <div className="semi small">{label}</div>
        {hint && <div className="tiny muted">{hint}</div>}
      </div>
      <Toggle on={on} onChange={set} />
    </div>
  );
}
