import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AppBar } from "@/components/common";
import { MapPin } from "@/components/Icons";
import { useApp } from "@/store";
import { providerService, profileControlService, userService } from "@/services";
import { ErrorView } from "@/components/states";
import { SettingsSection, SettingsRow, SettingsToggleRow } from "@/components/settings";
import ProviderManageNav from "./ProviderManageNav";

export default function ProviderSettings() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { showToast, setContext, user } = useApp();
  // "New leads" has no notification-emission trigger yet — localStorage-only
  // until that trigger exists. "Requests matching my skills", below, is
  // different: it already fires server-side via NEARBY_REQUEST/
  // notif_nearby_requests, so it's wired to the real column.
  const [leads, setLeads] = useState(() => localStorage.getItem("prov_notif_leads") !== "false");
  useEffect(() => { localStorage.setItem("prov_notif_leads", String(leads)); }, [leads]);
  const [matched, setMatched] = useState(user.notifNearbyRequests !== false);
  useEffect(() => { setMatched(user.notifNearbyRequests !== false); }, [user.notifNearbyRequests]);
  const [loading, setLoading] = useState(true);
  const [ownerEnabled, setOwnerEnabled] = useState(true);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [showPhone, setShowPhone] = useState(true);
  const [showEmail, setShowEmail] = useState(false);
  const [locPublic, setLocPublic] = useState(false);
  const [serviceRadiusKm, setServiceRadiusKm] = useState(10);

  function persist(patch: Record<string, unknown>) {
    void providerService.update(id, patch as any).catch(() => showToast("Couldn't save — try again"));
  }
  function persistMatched(v: boolean) {
    setMatched(v);
    userService.update({ notifNearbyRequests: v } as any)
      .then(() => showToast(v ? "You'll hear about matching requests" : "Matching-request alerts off"))
      .catch(() => {
        setMatched(!v);
        showToast("Couldn't save — try again");
      });
  }
  async function saveEmail() {
    setSavingEmail(true);
    try { await providerService.update(id, { email: email.trim() || null } as any); showToast("Email saved"); }
    catch { showToast("Couldn't save email"); }
    finally { setSavingEmail(false); }
  }

  useEffect(() => {
    if (!id) return;
    providerService.get(id)
      .then((prov) => {
        if (prov) {
          setOwnerEnabled(prov.ownerEnabled !== false);
          setEmail(prov.email ?? "");
          setDisplayName(prov.displayName ?? "");
          setShowPhone(prov.showPhonePublicly !== false);
          setShowEmail(prov.showEmailPublicly === true);
          setLocPublic(prov.locationPublic === true);
          setServiceRadiusKm(prov.serviceRadiusKm ?? 10);
        }
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [id]);

  if (!id) {
    return (
      <div className="screen">
        <AppBar title="Settings" />
        <ErrorView error={{ code: "BAD_REQUEST", message: "Missing target ID parameter." } as any} />
      </div>
    );
  }

  async function handleToggleVisibility(v: boolean) {
    setOwnerEnabled(v);
    try {
      await profileControlService.setEnabled("PROVIDER", id, v);
      showToast(v ? "Provider profile is now visible" : "Provider profile hidden from discovery");
    } catch (err: any) {
      setOwnerEnabled(!v);
      showToast(err.message || "Failed to update visibility");
    }
  }

  if (loading) {
    return (
      <div className="screen with-nav">
        <AppBar title="Provider settings" />
        <div className="screen-scroll page-pad col center" style={{ paddingTop: 80 }}>
          <div className="muted small">Loading settings...</div>
        </div>
        <ProviderManageNav pid={id} />
      </div>
    );
  }

  return (
    <div className="screen with-nav">
      <AppBar title="Provider settings" />

      <div className="screen-scroll page-pad col gap-16" style={{ paddingBottom: 20 }}>
        <SettingsSection title="Notifications">
          <SettingsToggleRow label="New leads" on={leads} onChange={setLeads} />
          <SettingsToggleRow
            label="Requests matching my skills"
            hint="Also controls your personal 'Nearby requests' alerts"
            on={matched}
            onChange={persistMatched}
          />
        </SettingsSection>

        {/* Payment setup now lives in the Money tab (UPI, QR, collection timing). */}

        {/* Service radius — set from the profile page (Profile → Edit profile), not here. */}
        <SettingsSection title="Service area">
          <SettingsRow
            icon={<MapPin size={18} color="var(--green-600)" />}
            label="Service radius"
            value={serviceRadiusKm >= 5000 ? "🌍 Worldwide" : serviceRadiusKm === 0.5 ? "500 m" : `${serviceRadiusKm} km`}
            hint="Edit on your profile page"
            onClick={() => nav(`/provider/${id}/manage/edit-profile`)}
          />
        </SettingsSection>

        <SettingsSection title="Contact & privacy">
          <div style={{ padding: "13px 14px" }}>
            <div className="tiny semi" style={{ marginBottom: 6 }}>Email</div>
            <div className="row gap-8">
              <input className="input grow" placeholder="e.g. you@email.com" value={email} onChange={(e) => setEmail(e.target.value)} style={{ fontSize: 14 }} />
              <button className="btn btn-outline btn-sm" disabled={savingEmail} onClick={saveEmail}>{savingEmail ? "…" : "Save"}</button>
            </div>
          </div>
          <SettingsToggleRow label="Show phone publicly" on={showPhone} onChange={(v) => { setShowPhone(v); persist({ showPhonePublicly: v }); }} />
          <SettingsToggleRow label="Show email publicly" on={showEmail} onChange={(v) => { setShowEmail(v); persist({ showEmailPublicly: v }); }} />
          <SettingsToggleRow label="Exact location public" hint="OFF = customers must request & you approve" on={locPublic} onChange={(v) => { setLocPublic(v); persist({ locationPublic: v }); }} />
        </SettingsSection>

        <SettingsSection title="Visibility">
          <SettingsToggleRow label="Show provider profile publicly" on={ownerEnabled} onChange={handleToggleVisibility} />
        </SettingsSection>

        <button className="btn btn-ghost btn-block" onClick={() => { setContext({ type: "customer", id: null, name: "Personal" }); nav("/home"); }}>Exit provider mode</button>
      </div>
      <ProviderManageNav pid={id} />
    </div>
  );
}
