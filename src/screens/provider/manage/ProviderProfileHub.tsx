import { useParams, useNavigate } from "react-router-dom";
import { AppBar, SafeImg, StarRow } from "@/components/common";
import { providerService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { useApp } from "@/store";
import { Skeleton, ErrorView } from "@/components/states";
import ProviderManageNav from "./ProviderManageNav";
import {
  User, Clock, Image as ImageIcon, BadgeCheck, Settings, ChevronRight,
  Star, Wallet, Globe, FileText, Inbox, LogOut,
} from "@/components/Icons";

// The provider's single identity home: a preview of what customers see, plus
// one place to reach every editor (identity, schedule, portfolio, verification,
// payments, privacy) and read reviews. Replaces the three scattered editors
// (see PROVIDER_DESIGN.md §6).
export default function ProviderProfileHub() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { signOut } = useApp();
  const base = `/provider/${id}/manage`;

  const { data: p, loading, error, refetch } = useQuery(() => providerService.get(id), [id]);
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

  const sections: { icon: any; color: string; label: string; hint: string; to: string }[] = [
    { icon: User, color: "var(--pink-500)", label: "Identity", hint: "Bio, skills, price, service radius", to: `${base}/edit-profile` },
    { icon: FileText, color: "var(--brand-600)", label: "Services", hint: `${p?.catalog?.length ?? 0} service${(p?.catalog?.length ?? 0) === 1 ? "" : "s"} customers can book`, to: `${base}/catalog` },
    { icon: Clock, color: "var(--blue-500)", label: "Schedule", hint: "Working days, hours & slot length", to: `${base}/availability` },
    { icon: ImageIcon, color: "var(--brand-600)", label: "Portfolio", hint: `${p?.portfolio?.length ?? 0} work sample${(p?.portfolio?.length ?? 0) === 1 ? "" : "s"}`, to: `${base}/portfolio` },
    { icon: Inbox, color: "var(--blue-500)", label: "Reachouts", hint: "Calls and messages from customers", to: `${base}/inbox` },
    { icon: BadgeCheck, color: "var(--green-600)", label: "Verification", hint: verifyLabel, to: `${base}/verify` },
    { icon: Wallet, color: "var(--orange-500)", label: "Payments", hint: "UPI, QR & when you get paid", to: `${base}/money` },
    { icon: Settings, color: "var(--ink-600)", label: "Privacy & settings", hint: "Contact visibility, notifications, visibility", to: `${base}/settings` },
  ];

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

        {/* Edit sections */}
        <div className="card" style={{ overflow: "hidden", padding: 0 }}>
          {sections.map((s, i) => {
            const Icon = s.icon;
            return (
              <button
                key={s.label}
                className="row gap-12 center-v"
                style={{ width: "100%", padding: "14px 16px", borderTop: i > 0 ? "1px solid var(--line)" : "none", textAlign: "left" }}
                onClick={() => nav(s.to)}
              >
                <div style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--ink-50)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon size={17} color={s.color} />
                </div>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="semi small">{s.label}</div>
                  <div className="tiny muted ellipsis">{s.hint}</div>
                </div>
                <ChevronRight size={16} color="var(--ink-300)" />
              </button>
            );
          })}
        </div>

        {/* Reviews (read-only) */}
        <div>
          <div className="small semi muted row gap-6" style={{ marginBottom: 8 }}><Star size={14} /> Recent reviews</div>
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

        <button
          type="button"
          onClick={() => { signOut(); nav("/"); }}
          className="row center gap-8"
          style={{ padding: "13px", width: "100%", background: "var(--red-50)", border: "1px solid var(--red-500)", borderRadius: 12, color: "var(--red-600)", fontWeight: 700, cursor: "pointer" }}
        >
          <LogOut size={17} /> Log out
        </button>

      </div>
      <ProviderManageNav pid={id} />
    </div>
  );
}
