import { useParams, useNavigate } from "react-router-dom";
import { AppBar, SafeImg, StarRow } from "@/components/common";
import { providerService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { useApp } from "@/store";
import { Skeleton, ErrorView } from "@/components/states";
import { SettingsSection, SettingsRow } from "@/components/settings";
import HatSwitcherCard from "@/components/HatSwitcherCard";
import ProviderManageNav from "./ProviderManageNav";
import {
  User, Clock, Image as ImageIcon, BadgeCheck, Settings,
  Wallet, Globe, FileText, Inbox, LogOut, AlertTriangle,
} from "@/components/Icons";

const LOW_STOCK_THRESHOLD = 5;

// The provider's single identity home: a preview of what customers see, plus
// one place to reach every editor (identity, schedule, portfolio, verification,
// payments, privacy) and read reviews. Replaces the three scattered editors
// (see PROVIDER_DESIGN.md §6).
export default function ProviderProfileHub() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { signOut } = useApp();
  const base = `/provider/${id}/manage`;

  const { data: p, loading, error, refetch } = useQuery(() => providerService.get(id), [id], `provider:${id}`);
  const { data: reviews } = useQuery(() => providerService.reviews(id), [id]);

  if (!id) {
    return (
      <div className="screen">
        <AppBar title="Profile" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="screen with-nav">
        <AppBar title="Profile" />
        <div className="page-pad col gap-12" style={{ marginTop: 12 }}>
          <Skeleton h={120} mb={0} />
          <Skeleton h={56} mb={0} />
          <Skeleton h={56} mb={0} />
        </div>
        <ProviderManageNav pid={id} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="screen with-nav">
        <AppBar title="Profile" />
        <ErrorView error={error} onRetry={refetch} />
        <ProviderManageNav pid={id} />
      </div>
    );
  }

  const verifyStatus = p?.verificationStatus;
  const verifyLabel = p?.isVerified
    ? "Verified ✓"
    : verifyStatus === "UNDER_REVIEW"
      ? "Under review"
      : verifyStatus === "REJECTED"
        ? "Rejected — resubmit"
        : "Get the ✓ badge";

  const flaggedCount = (p?.catalog ?? []).filter(
    (item) => item.stockStatus === "OUT_OF_STOCK" || (item.inventoryType === "FINITE" && (item.quantity ?? 0) <= LOW_STOCK_THRESHOLD)
  ).length;

  return (
    <div className="screen with-nav">
      <AppBar title="Profile" />
      <div className="screen-scroll page-pad col gap-16" style={{ paddingBottom: 24 }}>

        {/* Public preview — what customers see */}
        <div className="card col gap-12" style={{ padding: 16 }}>
          <div className="row between center-v">
            <span className="tiny semi muted" style={{ textTransform: "uppercase", letterSpacing: 0.5 }}>Your public page</span>
            <button className="tiny semi row gap-4 center-v" style={{ color: "var(--brand-700)" }} onClick={() => nav(`/provider/${id}`)}>
              <Globe size={13} /> View →
            </button>
          </div>
          <div className="row gap-12 center-v">
            <SafeImg src={p?.avatar} variant="avatar" className="avatar" style={{ width: 60, height: 60, flexShrink: 0 }} />
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="row gap-6 center-v">
                <span className="bold" style={{ fontSize: 17 }}>{p?.displayName}</span>
                {p?.isVerified && <BadgeCheck size={16} color="var(--green-600)" />}
              </div>
              <div className="tiny muted">{p?.categoryName}{p?.startingPrice ? ` · from ₹${p.startingPrice}` : ""}</div>
              <div className="row gap-6 center-v" style={{ marginTop: 4 }}>
                <StarRow value={p?.ratingAvg ?? 0} size={12} />
                <span className="tiny muted">{(p?.ratingCount ?? 0) > 0 ? `${p?.ratingAvg} (${p?.ratingCount})` : "New"}</span>
              </div>
            </div>
          </div>
          {(p?.skills?.length ?? 0) > 0 && (
            <div className="row wrap gap-6">
              {(p?.skills ?? []).slice(0, 6).map((s) => <span key={s} className="badge badge-gray" style={{ fontSize: 11 }}>{s}</span>)}
            </div>
          )}
        </div>

        <SettingsSection title="Profile & services">
          <SettingsRow icon={<User size={19} color="var(--pink-500)" />} label="Edit profile" hint="Bio, skills, price, service radius" onClick={() => nav(`${base}/edit-profile`)} />
          <SettingsRow icon={<FileText size={19} color="var(--brand-600)" />} label="Services" hint={`${p?.catalog?.length ?? 0} service${(p?.catalog?.length ?? 0) === 1 ? "" : "s"} customers can book`} onClick={() => nav(`${base}/catalog`)} />
          <SettingsRow icon={<AlertTriangle size={19} color="var(--red-600)" />} label="Inventory management" hint={flaggedCount > 0 ? `${flaggedCount} item${flaggedCount === 1 ? "" : "s"} need restocking` : "Out-of-stock and low items"} onClick={() => nav(`${base}/inventory`)} />
          <SettingsRow icon={<Clock size={19} color="var(--blue-500)" />} label="Hours & Availability" hint="Working days, hours & slot length" onClick={() => nav(`${base}/availability`)} />
          <SettingsRow icon={<ImageIcon size={19} color="var(--brand-600)" />} label="Portfolio" hint={`${p?.portfolio?.length ?? 0} work sample${(p?.portfolio?.length ?? 0) === 1 ? "" : "s"}`} onClick={() => nav(`${base}/portfolio`)} />
        </SettingsSection>

        <SettingsSection title="Customer communication">
          <SettingsRow icon={<Inbox size={19} color="var(--blue-500)" />} label="Reachouts" hint="Calls and messages from customers" onClick={() => nav(`${base}/inbox`)} />
        </SettingsSection>

        <SettingsSection title="Account">
          <SettingsRow icon={<BadgeCheck size={19} color="var(--green-600)" />} label="Verification" hint={verifyLabel} onClick={() => nav(`${base}/verify`)} />
          <SettingsRow icon={<Wallet size={19} color="var(--orange-500)" />} label="Money" hint="UPI, QR & when you get paid" onClick={() => nav(`${base}/money`)} />
          <SettingsRow icon={<Settings size={19} color="var(--ink-600)" />} label="Provider settings" hint="Contact visibility, notifications, visibility" onClick={() => nav(`${base}/settings`)} />
        </SettingsSection>

        {/* Reviews (read-only) */}
        <div>
          <div className="profile-eyebrow">Recent reviews</div>
          {(reviews ?? []).length === 0 ? (
            <div className="card col center" style={{ padding: 24, gap: 6 }}>
              <span style={{ fontSize: 28 }}>⭐</span>
              <span className="tiny muted">Reviews from completed jobs appear here.</span>
            </div>
          ) : (
            <div className="col gap-10">
              {(reviews ?? []).slice(0, 5).map((rv) => (
                <div key={rv.id} className="card row gap-12" style={{ alignItems: "flex-start", padding: 14 }}>
                  <SafeImg src={rv.raterAvatar} variant="avatar" className="avatar" style={{ width: 38, height: 38, flexShrink: 0 }} />
                  <div className="grow">
                    <div className="row between"><span className="semi small">{rv.raterName}</span><span className="tiny muted">{rv.date}</span></div>
                    <div className="row gap-8 align-center" style={{ marginTop: 2 }}>
                      <StarRow value={rv.rating} size={12} />
                      {rv.isVerifiedBooking && (
                        <span className="tiny semi row gap-2" style={{ color: "var(--green-600)", alignItems: "center" }}>
                          <BadgeCheck size={11} /> Verified
                        </span>
                      )}
                    </div>
                    {rv.comment && <p className="small" style={{ marginTop: 6, lineHeight: 1.5 }}>{rv.comment}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <HatSwitcherCard showManageLink={false} />

        <button
          type="button"
          className="btn btn-block row center gap-8"
          style={{ color: "var(--red-600)", background: "var(--red-50)", border: "1px solid var(--red-100)" }}
          onClick={() => { signOut(); nav("/"); }}
        >
          <LogOut size={18} /> Log out
        </button>

      </div>
      <ProviderManageNav pid={id} />
    </div>
  );
}
