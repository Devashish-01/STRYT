import { useState, useEffect } from "react";
import { AppBar, SafeImg } from "@/components/common";
import { Moon, Volume2, Globe, Shield, Eye, Pencil, MapPin, Check, X, FileText, Lock } from "@/components/Icons";
import { useApp } from "@/store";
import { userService, profileControlService, locationService } from "@/services";
import { useQueryWithRealtime } from "@/hooks/useApi";
import type { LocationGrant } from "@/services/engagement/locationService";
import { useI18n, LANG_LABELS, type Lang } from "@/lib/i18n";
import RadiusSelector from "@/components/RadiusSelector";
import PinEntrySheet from "@/components/PinEntrySheet";
import { switchPinService } from "@/services";


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
  const { user, refreshUser, showToast, switchPinIsSet, refreshSwitchPinStatus, ownedBusinessIds, ownedProviderId } = useApp();
  const [pinSheet, setPinSheet] = useState<"set" | "remove" | null>(null);
  const [removingPin, setRemovingPin] = useState(false);
  const hasHats = ownedBusinessIds.length > 0 || !!ownedProviderId;
  const [silent, setSilent] = useState(() => localStorage.getItem("settings_silent") !== "false");
  const [quiet, setQuiet] = useState(() => localStorage.getItem("settings_quiet") !== "false");
  const [newBiz, setNewBiz] = useState(() => localStorage.getItem("settings_new_biz") !== "false");
  const [newProv, setNewProv] = useState(() => localStorage.getItem("settings_new_prov") !== "false");
  const [reqs, setReqs] = useState(() => localStorage.getItem("settings_reqs") !== "false");
  const [offers, setOffers] = useState(() => localStorage.getItem("settings_offers") !== "false");
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

  async function handleRemovePin(pin: string) {
    setRemovingPin(true);
    try {
      await switchPinService.clear(pin);
      await refreshSwitchPinStatus();
      showToast("Switch PIN removed");
      setPinSheet(null);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Couldn't remove the PIN.");
    } finally {
      setRemovingPin(false);
    }
  }

  const { lang, setLang } = useI18n();
  const langs = Object.entries(LANG_LABELS) as [Lang, string][];

  return (
    <div className="screen screen-boxed">
      <AppBar title="Settings" />
      <div className="screen-scroll page-pad col gap-16" style={{ paddingBottom: 40 }}>
        {/* Inbound location-share requests to approve/deny */}
        <LocationRequestsInbox />
        <LocationSharesManager />

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
            <Row icon={<Moon size={18} color="var(--blue-500)" />} label="Silent notifications" hint="Badge only, no sound" on={silent} set={setSilent} />
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

            <Row label="Show Posts publicly" hint="Allow neighbors to see your community posts on your profile" on={showPosts} set={handleTogglePosts} />
            <Row label="Show Service Requests publicly" hint="Allow neighbors to see your open & past asks" on={showAsks} set={handleToggleAsks} />
            <Row label="Show Badges publicly" hint="Show trust badges & verifications on your profile" on={showBadges} set={handleToggleBadges} />
            <Row label="Show customer profile publicly" hint="When disabled, you are hidden from search and leaderboards" on={customerEnabled} set={handleToggleCustomerEnabled} last />
          </div>
        </div>

        {/* Security — only relevant once there's a business/provider hat to protect */}
        {hasHats && (
          <div>
            <div className="small semi muted row gap-6" style={{ marginBottom: 8 }}><Lock size={14} /> Security</div>
            <div className="card" style={{ padding: 14 }}>
              <div className="row gap-12">
                <div className="grow">
                  <div className="semi small">Switch PIN</div>
                  <div className="tiny muted">
                    {switchPinIsSet
                      ? "Required whenever you switch into your business or provider console."
                      : "Ask for a PIN when switching into your business or provider console — useful if others sometimes use this device."}
                  </div>
                </div>
              </div>
              <div className="row gap-8" style={{ marginTop: 10 }}>
                <button className="btn btn-outline btn-sm grow" onClick={() => setPinSheet("set")}>
                  {switchPinIsSet ? "Change PIN" : "Set PIN"}
                </button>
                {switchPinIsSet && (
                  <button className="btn btn-outline btn-sm grow" style={{ color: "var(--red-600)", borderColor: "var(--red-200)" }} onClick={() => setPinSheet("remove")}>
                    Remove PIN
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

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

        <div className="card" style={{ background: "var(--brand-50)", border: "1px solid var(--brand-100)" }}>
          <div className="row gap-8 small" style={{ color: "var(--brand-700)" }}>
            <Shield size={18} />
            <span>Your data is yours. We store only your last location, never a trail. Request deletion anytime.</span>
          </div>
        </div>
      </div>

      {showDeleteModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div className="card col gap-12" style={{ maxWidth: 400, width: "100%", padding: 16, background: "var(--ink-50)", boxShadow: "var(--shadow-lg)" }}>
            <h3 className="bold h2">Request Deletion</h3>
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

      {pinSheet === "set" && (
        <PinEntrySheet mode="set" onClose={() => setPinSheet(null)} onSaved={() => setPinSheet(null)} />
      )}
      {pinSheet === "remove" && (
        <PinEntrySheet
          mode="verify"
          onClose={() => setPinSheet(null)}
          onVerified={(pin) => { if (!removingPin) void handleRemovePin(pin); }}
        />
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

// Owner-side inbox: people asking to see your exact location. Approve/deny inline.
// Live via realtime on location_share_grants; renders nothing when empty.
function LocationRequestsInbox() {
  const { showToast } = useApp();
  const { data, refetch } = useQueryWithRealtime(
    () => locationService.pendingForMe(),
    "location_share_grants",
    []
  );
  const pending: LocationGrant[] = data ?? [];
  if (pending.length === 0) return null;

  async function respond(requesterUserId: string, approve: boolean) {
    try {
      await locationService.respond(requesterUserId, approve);
      showToast(approve ? "Location shared" : "Request denied");
      refetch();
    } catch {
      showToast("Couldn't update — try again");
    }
  }

  return (
    <div>
      <div className="small semi muted row gap-6" style={{ marginBottom: 8, alignItems: "center" }}>
        <MapPin size={14} color="var(--brand-600)" /> Location requests
      </div>
      <div className="card col gap-8" style={{ padding: 12 }}>
        {pending.map((g) => (
          <div key={g.id} className="row gap-10" style={{ alignItems: "center" }}>
            <SafeImg src={g.requesterAvatar} variant="avatar" className="avatar" style={{ width: 38, height: 38 }} />
            <div className="grow">
              <div className="semi small" style={{ color: "var(--ink-900)" }}>{g.requesterName}</div>
              <div className="tiny muted">wants to see your exact location</div>
            </div>
            <button
              className="icon-btn"
              style={{ background: "var(--green-100)", color: "var(--green-600)", width: 34, height: 34 }}
              onClick={() => respond(g.requesterUserId, true)}
              aria-label="Approve"
            >
              <Check size={16} />
            </button>
            <button
              className="icon-btn"
              style={{ background: "var(--ink-100)", color: "var(--ink-600)", width: 34, height: 34 }}
              onClick={() => respond(g.requesterUserId, false)}
              aria-label="Deny"
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// Active and historical location shares. Shows durations and allows revocation.
function LocationSharesManager() {
  const { showToast } = useApp();
  const { data: activeShares, refetch: refetchActive } = useQueryWithRealtime(
    () => locationService.sharedByMe(),
    "location_share_grants",
    []
  );
  const { data: historyShares, refetch: refetchHistory } = useQueryWithRealtime(
    () => locationService.shareHistory(),
    "location_share_grants",
    []
  );

  async function handleRevoke(requesterUserId: string) {
    try {
      await locationService.revoke(requesterUserId);
      showToast("Access revoked successfully");
      refetchActive();
      refetchHistory();
    } catch {
      showToast("Failed to revoke access. Try again.");
    }
  }

  async function handleRenew(requesterUserId: string) {
    try {
      await locationService.renew(requesterUserId);
      showToast("Access renewed for 24 more hours");
      refetchActive();
    } catch {
      showToast("Failed to renew access. Try again.");
    }
  }

  const formatRel = (iso?: string) => {
    if (!iso) return "";
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  const formatExpiry = (iso?: string | null): { label: string; expired: boolean } => {
    if (!iso) return { label: "", expired: false };
    const diff = new Date(iso).getTime() - Date.now();
    if (diff <= 0) return { label: "Expired", expired: true };
    const h = Math.floor(diff / 3600000);
    if (h < 1) return { label: `Expires in ${Math.floor(diff / 60000)}m`, expired: false };
    if (h < 24) return { label: `Expires in ${h}h`, expired: false };
    return { label: `Expires in ${Math.floor(h / 24)}d`, expired: false };
  };

  if ((!activeShares || activeShares.length === 0) && (!historyShares || historyShares.length === 0)) {
    return null;
  }

  return (
    <div className="col gap-12">
      {/* Active Shares */}
      {activeShares && activeShares.length > 0 && (
        <div>
          <div className="small semi muted row gap-6" style={{ marginBottom: 8, alignItems: "center" }}>
            <Eye size={14} color="var(--green-500)" /> Currently sharing location with
          </div>
          <div className="card col gap-8" style={{ padding: 12 }}>
            {activeShares.map((g) => {
              const expiry = formatExpiry(g.expiresAt);
              return (
                <div key={g.id} className="row gap-10" style={{ alignItems: "center" }}>
                  <SafeImg src={g.requesterAvatar} variant="avatar" className="avatar" style={{ width: 34, height: 34 }} />
                  <div className="grow">
                    <div className="semi small" style={{ color: "var(--ink-900)" }}>{g.requesterName}</div>
                    <div className="tiny muted row gap-6">
                      <span>Shared {formatRel(g.updatedAt)}</span>
                      {expiry.label && <span style={{ color: expiry.expired ? "var(--red-600)" : "var(--ink-400)" }}>· {expiry.label}</span>}
                    </div>
                  </div>
                  <button
                    className="btn"
                    style={{
                      padding: "4px 10px",
                      background: "var(--brand-50)",
                      color: "var(--brand-700)",
                      border: "1px solid var(--brand-100)",
                      fontSize: 11.5,
                      borderRadius: 8,
                      cursor: "pointer",
                    }}
                    onClick={() => handleRenew(g.requesterUserId)}
                  >
                    Renew
                  </button>
                  <button
                    className="btn"
                    style={{
                      padding: "4px 10px",
                      background: "var(--red-50)",
                      color: "var(--red-600)",
                      border: "1px solid var(--red-100)",
                      fontSize: 11.5,
                      borderRadius: 8,
                      cursor: "pointer",
                    }}
                    onClick={() => handleRevoke(g.requesterUserId)}
                  >
                    Revoke
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Sharing History */}
      {historyShares && historyShares.length > 0 && (
        <div>
          <div className="small semi muted row gap-6" style={{ marginBottom: 8, alignItems: "center" }}>
            <FileText size={14} color="var(--ink-500)" /> Location sharing history
          </div>
          <div className="card col gap-8" style={{ padding: 12 }}>
            {historyShares.map((g) => (
              <div key={g.id} className="row gap-10" style={{ alignItems: "center" }}>
                <SafeImg src={g.requesterAvatar} variant="avatar" className="avatar" style={{ width: 32, height: 32, opacity: 0.7 }} />
                <div className="grow">
                  <div className="semi small muted">{g.requesterName}</div>
                  <div className="tiny muted">
                    {g.status === "DENIED" ? "Request denied" : "Share revoked"}{" "}
                    {formatRel(g.updatedAt)}
                  </div>
                </div>
                <span
                  className="tiny"
                  style={{
                    background: "var(--ink-100)",
                    color: "var(--ink-600)",
                    padding: "2px 6px",
                    borderRadius: 4,
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                >
                  {g.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
