import { useParams, useNavigate } from "react-router-dom";
import { AppBar, SafeImg, StarRow } from "@/components/common";
import { businessService } from "@/services";
import { useQuery, useQueryWithRealtime } from "@/hooks/useApi";
import { useApp } from "@/store";
import { Skeleton, ErrorView } from "@/components/states";
import { SettingsSection, SettingsRow } from "@/components/settings";
import { useBusinessAccess } from "@/components/BusinessAccessGuard";
import HatSwitcherCard from "@/components/HatSwitcherCard";
import ManageNav from "./ManageNav";
import {
  BadgeCheck, Settings, Wallet, Globe, Store, Users, LogOut, Star, ChevronRight,
} from "@/components/Icons";

// The business identity home: public preview, profile editors, account controls,
// and hat switching — parity with ProviderProfileHub and customer Profile.
export default function BusinessProfileHub() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { signOut } = useApp();
  const { isOwner } = useBusinessAccess();
  const base = `/business/${id}/manage`;

  const { data: b, loading, error, refetch } = useQuery(() => businessService.get(id), [id], `business:${id}`);
  const { data: reviews } = useQueryWithRealtime(() => businessService.reviews(id), "ratings", [id], `ratee_id=eq.${id}`);

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
        <ManageNav bizId={id} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="screen with-nav">
        <AppBar title="Profile" />
        <ErrorView error={error} onRetry={refetch} />
        <ManageNav bizId={id} />
      </div>
    );
  }

  const verifyLabel = b?.isVerified ? "Verified ✓" : "Get verified";

  return (
    <div className="screen with-nav">
      <AppBar title="Profile" />
      <div className="screen-scroll page-pad col gap-16" style={{ paddingBottom: 24 }}>

        <div className="card col gap-12" style={{ padding: 16 }}>
          <div className="row between center-v">
            <span className="tiny semi muted" style={{ textTransform: "uppercase", letterSpacing: 0.5 }}>Your public page</span>
            <button className="tiny semi row gap-4 center-v" style={{ color: "var(--brand-700)" }} onClick={() => nav(`/business/${id}`)}>
              <Globe size={13} /> View →
            </button>
          </div>
          <div className="row gap-12 center-v">
            <SafeImg src={b?.coverImage} style={{ width: 60, height: 60, borderRadius: 12, objectFit: "cover", flexShrink: 0 }} />
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="row gap-6 center-v">
                <span className="bold" style={{ fontSize: 17 }}>{b?.name}</span>
                {b?.isVerified && <BadgeCheck size={16} color="var(--green-600)" />}
              </div>
              <div className="tiny muted">{b?.categoryName}{b?.city ? ` · ${b.city}` : ""}</div>
              <div className="row gap-6 center-v" style={{ marginTop: 4 }}>
                <StarRow value={b?.ratingAvg ?? 0} size={12} />
                <span className="tiny muted">{(b?.ratingCount ?? 0) > 0 ? `${b?.ratingAvg} (${b?.ratingCount})` : "New"}</span>
              </div>
            </div>
          </div>
        </div>

        {isOwner && (
          <SettingsSection title="Profile & identity">
            <SettingsRow icon={<Store size={19} color="var(--orange-500)" />} label="Edit profile" hint="Name, cover, contact and location" onClick={() => nav(`${base}/edit-profile`)} />
            <SettingsRow icon={<Globe size={19} color="var(--blue-500)" />} label="Service radius" hint="Bookings, posts and stories reach" onClick={() => nav(`${base}/broadcast`)} />
            <SettingsRow icon={<Star size={19} color="var(--amber-500)" />} label="Customer reviews" hint={(b?.ratingCount ?? 0) > 0 ? `${b?.ratingAvg}★ (${b?.ratingCount} reviews)` : "View & reply to reviews"} onClick={() => nav(`${base}/reviews`)} />
            <SettingsRow icon={<BadgeCheck size={19} color="var(--green-600)" />} label="Verification" hint={verifyLabel} onClick={() => nav(`${base}/verify`)} />
          </SettingsSection>
        )}

        {isOwner && (
          <SettingsSection title="Account">
            <SettingsRow icon={<Users size={19} color="var(--green-600)" />} label="Team & access" hint="Add team members with scoped access" onClick={() => nav("/account/business-access")} />
            <SettingsRow icon={<Wallet size={19} color="var(--orange-500)" />} label="Payments" hint="UPI, QR and payment records" onClick={() => nav(`${base}/payments`)} />
            <SettingsRow icon={<Settings size={19} color="var(--ink-600)" />} label="Business settings" hint="Controls and account settings" onClick={() => nav(`${base}/settings`)} />
          </SettingsSection>
        )}

        {(reviews ?? []).length > 0 && (
          <div className="card row between center-v" style={{ padding: 14, cursor: "pointer" }} onClick={() => nav(`${base}/reviews`)}>
            <div className="row gap-10 center-v">
              <Star size={20} color="var(--amber-500)" weight="fill" />
              <div>
                <div className="semi small">Customer reviews</div>
                <div className="tiny muted">{reviews?.length} review{(reviews?.length ?? 0) === 1 ? "" : "s"} — tap to view & reply</div>
              </div>
            </div>
            <ChevronRight size={16} className="muted" />
          </div>
        )}

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
      <ManageNav bizId={id} />
    </div>
  );
}
