import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AppBar } from "@/components/common";
import { MapPin } from "@/components/Icons";
import { useApp } from "@/store";
import { providerService, bustProviderGetCache, profileControlService, userService } from "@/services";
import { ErrorView, Skeleton } from "@/components/states";
import { SettingsSection, SettingsRow, SettingsToggleRow } from "@/components/settings";
import ProviderManageNav from "./ProviderManageNav";
import { invalidateQueryCache } from "@/hooks/useApi";
import { resolvePackage, BUSINESS_PACKAGES, type BusinessPackageKey } from "@/lib/businessPackages";
import { MARKETPLACE_PACKAGE_KEYS } from "@/lib/marketplaceScope";
import { useI18n } from "@/lib/i18n";
import { errorMessage } from "@/lib/errorMessage";
import { AccessibleSheet } from "@/components/ui/AccessibleSheet";

export default function ProviderSettings() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { showToast, setContext, user } = useApp();
  const { t, tf } = useI18n();
  // "New leads" has no notification-emission trigger yet — localStorage-only
  // until that trigger exists. "Requests matching my skills", below, is
  // different: it already fires server-side via NEARBY_REQUEST/
  // notif_nearby_requests, so it's wired to the real column.
  const [leads, setLeads] = useState(() => localStorage.getItem("prov_notif_leads") !== "false");
  useEffect(() => { localStorage.setItem("prov_notif_leads", String(leads)); }, [leads]);
  const [matched, setMatched] = useState(user.notifNearbyRequests !== false);
  useEffect(() => { setMatched(user.notifNearbyRequests !== false); }, [user.notifNearbyRequests]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<any>(null);
  const [ownerEnabled, setOwnerEnabled] = useState(true);
  const [savingOwnerEnabled, setSavingOwnerEnabled] = useState(false);
  const [accepting, setAccepting] = useState(true);
  const [savingAccepting, setSavingAccepting] = useState(false);
  const [email, setEmail] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [showPhone, setShowPhone] = useState(true);
  const [showEmail, setShowEmail] = useState(false);
  const [locPublic, setLocPublic] = useState(false);
  const [savingPrivacy, setSavingPrivacy] = useState(false);
  const [serviceRadiusKm, setServiceRadiusKm] = useState(10);
  const [pkgKey, setPkgKey] = useState<BusinessPackageKey>("generic");
  const [packagePicking, setPackagePicking] = useState(false);
  const [bookingsOn, setBookingsOn] = useState(true);
  const [savingBookingsOn, setSavingBookingsOn] = useState(false);

  function persistMatched(v: boolean) {
    setMatched(v);
    userService.update({ notifNearbyRequests: v } as any)
      .then(() => showToast(v ? "You'll hear about matching requests" : "Matching-request alerts off"))
      .catch(() => {
        setMatched(!v);
        showToast(t("cpd_save_failed"));
      });
  }
  async function saveEmail() {
    setSavingEmail(true);
    try { await providerService.update(id, { email: email.trim() || null } as any); showToast(t("bset_email_saved")); }
    catch { showToast(t("pset_email_save_failed")); }
    finally { setSavingEmail(false); }
  }

  async function toggleShowPhone(v: boolean) {
    const prev = showPhone;
    setShowPhone(v);
    setSavingPrivacy(true);
    try {
      await providerService.update(id, { showPhonePublicly: v } as any);
      bustProviderGetCache(id);
      showToast(v ? "Phone number visible publicly" : "Phone number hidden from profile");
    } catch {
      setShowPhone(prev);
      showToast(t("cpd_save_failed"));
    } finally {
      setSavingPrivacy(false);
    }
  }

  async function toggleShowEmail(v: boolean) {
    const prev = showEmail;
    setShowEmail(v);
    setSavingPrivacy(true);
    try {
      await providerService.update(id, { showEmailPublicly: v } as any);
      bustProviderGetCache(id);
      showToast(v ? "Email address visible publicly" : "Email hidden from profile");
    } catch {
      setShowEmail(prev);
      showToast(t("cpd_save_failed"));
    } finally {
      setSavingPrivacy(false);
    }
  }

  async function toggleLocPublic(v: boolean) {
    const prev = locPublic;
    setLocPublic(v);
    setSavingPrivacy(true);
    try {
      await providerService.update(id, { locationPublic: v } as any);
      bustProviderGetCache(id);
      showToast(v ? "Exact location visible publicly" : "Exact location hidden from profile");
    } catch {
      setLocPublic(prev);
      showToast(t("cpd_save_failed"));
    } finally {
      setSavingPrivacy(false);
    }
  }

  const fetchSettings = useCallback(() => {
    if (!id) return;
    setLoading(true);
    setLoadError(null);
    providerService.get(id)
      .then((prov) => {
        if (prov) {
          setOwnerEnabled(prov.ownerEnabled !== false);
          setAccepting(prov.isOpenNow !== false);
          setEmail(prov.email ?? "");
          setShowPhone(prov.showPhonePublicly !== false);
          setShowEmail(prov.showEmailPublicly === true);
          setLocPublic(prov.locationPublic === true);
          setServiceRadiusKm(prov.serviceRadiusKm ?? 10);
          const resolved = resolvePackage(prov);
          setPkgKey(resolved);
          setBookingsOn(prov.bookingsEnabled ?? BUSINESS_PACKAGES[resolved].bookingsDefault);
        }
        setLoading(false);
      })
      .catch((err) => {
        setLoadError(err || { code: "UNKNOWN", message: "Couldn't load provider settings." });
        setLoading(false);
      });
  }, [id]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  if (!id) {
    return (
      <div className="screen">
        <AppBar title={t("settings")} />
        <ErrorView error={{ code: "BAD_REQUEST", message: "Missing target ID parameter." } as any} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="screen with-nav">
        <AppBar title={t("settings")} />
        <div className="page-pad" style={{ marginTop: 20 }}>
          <ErrorView error={loadError} onRetry={fetchSettings} />
        </div>
        <ProviderManageNav pid={id} />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="screen with-nav">
        <AppBar title={t("settings")} />
        <div className="page-pad col gap-12" style={{ marginTop: 20 }}>
          <Skeleton h={80} r={14} mb={0} />
          <Skeleton h={140} r={14} mb={0} />
          <Skeleton h={100} r={14} mb={0} />
        </div>
        <ProviderManageNav pid={id} />
      </div>
    );
  }

  async function handleToggleVisibility(v: boolean) {
    const prev = ownerEnabled;
    setOwnerEnabled(v);
    setSavingOwnerEnabled(true);
    try {
      await profileControlService.setEnabled("PROVIDER", id, v);
      showToast(v ? "Provider profile is now visible" : "Provider profile hidden from discovery");
    } catch (err) {
      setOwnerEnabled(prev);
      showToast(errorMessage(err, "Failed to update visibility"));
    } finally {
      setSavingOwnerEnabled(false);
    }
  }

  async function toggleAccepting(v: boolean) {
    const prev = accepting;
    setAccepting(v);
    setSavingAccepting(true);
    try {
      await providerService.update(id, { isOpenNow: v });
      showToast(v ? "Now accepting appointments" : "Paused — customers can't book new appointments");
      invalidateQueryCache(`provider:${id}`, () => bustProviderGetCache(id));
    } catch (err) {
      setAccepting(prev);
      showToast(errorMessage(err, "Couldn't save — try again"));
    } finally {
      setSavingAccepting(false);
    }
  }

  const pkg = BUSINESS_PACKAGES[pkgKey];

  async function savePackage(key: BusinessPackageKey) {
    setPackagePicking(false);
    const prev = pkgKey;
    setPkgKey(key);
    try {
      await providerService.update(id, { packageKey: key } as any);
      showToast(tf("bset_page_type_set", { label: BUSINESS_PACKAGES[key].label }));
      invalidateQueryCache(`provider:${id}`, () => bustProviderGetCache(id));
    } catch {
      setPkgKey(prev);
      showToast(t("cpd_save_failed"));
    }
  }

  async function toggleBookingsEnabled(v: boolean) {
    const prev = bookingsOn;
    setBookingsOn(v);
    setSavingBookingsOn(true);
    try {
      await providerService.update(id, { bookingsEnabled: v } as any);
      showToast(v ? "Bookings are on for this page" : "Bookings are off — your page shows your catalogue only, no booking button");
      invalidateQueryCache(`provider:${id}`, () => bustProviderGetCache(id));
    } catch {
      setBookingsOn(prev);
      showToast(t("cpd_save_failed"));
    } finally {
      setSavingBookingsOn(false);
    }
  }

  if (loading) {
    return (
      <div className="screen with-nav">
        <AppBar title={t("pset_title")} />
        <div className="screen-scroll page-pad col center" style={{ paddingTop: 80 }}>
          <div className="muted small">{t("pset_loading")}</div>
        </div>
        <ProviderManageNav pid={id} />
      </div>
    );
  }

  return (
    <div className="screen with-nav">
      <AppBar title={t("pset_title")} />

      <div className="screen-scroll page-pad col gap-16" style={{ paddingBottom: 20 }}>
        <SettingsSection title={t("notifications")}>
          <SettingsToggleRow
            label={t("bset_new_leads")}
            hint="Saved on this device. Live push notifications for new leads coming soon."
            on={leads}
            onChange={setLeads}
          />
          <SettingsToggleRow
            label={t("pset_matching_skills")}
            hint={t("bset_matching_requests_hint")}
            on={matched}
            onChange={persistMatched}
          />
        </SettingsSection>

        {/* Business Packages — the choice made visible and changeable for
            good, not just a one-time onboarding moment (PackageConfirmCard). */}
        <SettingsSection title={t("bset_page_type")}>
          <SettingsRow
            icon={<span style={{ fontSize: 18, lineHeight: 1 }}>{pkg.icon || "🏪"}</span>}
            label={t("bset_page_type")}
            hint={t("bset_page_type_hint")}
            value={pkg.key === "generic" ? "Plain page" : pkg.label}
            onClick={() => setPackagePicking(true)}
          />
          <SettingsToggleRow
            label={t("bset_take_bookings")}
            hint={bookingsOn ? "Your page shows a booking button" : "No booking button — catalogue only"}
            on={bookingsOn}
            disabled={savingBookingsOn}
            onChange={toggleBookingsEnabled}
          />
        </SettingsSection>

        <SettingsSection title={t("appointments")}>
          <SettingsToggleRow
            label={t("bset_accepting")}
            hint={accepting ? "Customers can book you right now" : "Paused — new bookings are turned off"}
            on={accepting}
            disabled={savingAccepting}
            onChange={toggleAccepting}
          />
        </SettingsSection>

        {/* Payment setup now lives in the Money tab (UPI, QR, collection timing). */}

        {/* Service radius — set from the profile page (Profile → Edit profile), not here. */}
        <SettingsSection title={t("service_area_label")}>
          <SettingsRow
            icon={<MapPin size={18} color="var(--green-600)" />}
            label={t("bset_service_radius")}
            value={serviceRadiusKm >= 5000 ? "🌍 Worldwide" : serviceRadiusKm === 0.5 ? "500 m" : `${serviceRadiusKm} km`}
            hint={t("pset_radius_hint")}
            onClick={() => nav(`/provider/${id}/manage/edit-profile`)}
          />
        </SettingsSection>

        <SettingsSection title={t("bset_contact_privacy")}>
          <div style={{ padding: "13px 14px" }}>
            <div className="tiny semi" style={{ marginBottom: 6 }}>{t("pset_email")}</div>
            <div className="row gap-8">
              <input className="input grow" placeholder={t("pset_email_placeholder")} value={email} onChange={(e) => setEmail(e.target.value)} style={{ fontSize: 14 }} />
              <button className="btn btn-outline btn-sm" disabled={savingEmail} onClick={saveEmail}>{savingEmail ? "…" : "Save"}</button>
            </div>
          </div>
          <SettingsToggleRow label={t("bset_show_phone")} on={showPhone} disabled={savingPrivacy} onChange={toggleShowPhone} />
          <SettingsToggleRow label={t("bset_show_email")} on={showEmail} disabled={savingPrivacy} onChange={toggleShowEmail} />
          <SettingsToggleRow label={t("bset_exact_location")} hint={t("bset_exact_location_hint")} on={locPublic} disabled={savingPrivacy} onChange={toggleLocPublic} />
        </SettingsSection>

        <SettingsSection title={t("bset_visibility")}>
          <SettingsToggleRow label={t("pset_show_profile")} on={ownerEnabled} disabled={savingOwnerEnabled} onChange={handleToggleVisibility} />
        </SettingsSection>

        <button className="btn btn-ghost btn-block" onClick={() => { setContext({ type: "customer", id: null, name: user.name || "Personal" }); nav("/home"); }}>{t("pset_exit_provider")}</button>

        <AccessibleSheet
          isOpen={packagePicking}
          onClose={() => setPackagePicking(false)}
          title={t("bset_choose_page_type")}
          description="Controls your page's layout, CTA wording, and the owner-side catalogue form."
          variant="bottom-sheet"
        >
          <div className="col gap-8">
            {MARKETPLACE_PACKAGE_KEYS.map((key) => {
              const p = BUSINESS_PACKAGES[key];
              const active = pkgKey === key;
              return (
                <button
                  key={key}
                  className="card row gap-10"
                  style={{ padding: 12, alignItems: "flex-start", textAlign: "left", border: active ? "2px solid var(--green-500)" : "1px solid var(--line)" }}
                  onClick={() => savePackage(key)}
                >
                  <span style={{ fontSize: 22, lineHeight: 1 }}>{p.icon || "🏪"}</span>
                  <span className="grow" style={{ minWidth: 0 }}>
                    <span className="semi small" style={{ display: "block" }}>{key === "generic" ? "Plain page" : p.label}</span>
                    <span className="tiny muted" style={{ display: "block", marginTop: 2, lineHeight: 1.4 }}>{p.blurb}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </AccessibleSheet>
      </div>
      <ProviderManageNav pid={id} />
    </div>
  );
}
