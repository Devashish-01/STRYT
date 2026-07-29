import { AppBar, SafeImg, EmptyState } from "@/components/common";
import { MapPin, Check, X, Eye, FileText } from "@/components/Icons";
import { useApp } from "@/store";
import { locationService } from "@/services";
import { useQueryWithRealtime } from "@/hooks/useApi";
import type { LocationGrant } from "@/services/engagement/locationService";

/**
 * Who can see where you are: incoming requests, who you're currently sharing
 * with, and the history.
 *
 * These two panels used to sit at the very top of the old /settings page —
 * above notifications, privacy and everything else — despite rendering nothing
 * at all for the majority of users who have no shares. Here they're behind a
 * row that names them, and the empty case says so instead of being blank.
 */
export default function LocationSettings() {
  const { showToast } = useApp();

  const { data: pendingData, refetch: refetchPending } = useQueryWithRealtime(
    () => locationService.pendingForMe(), "location_share_grants", []
  );
  const { data: activeShares, refetch: refetchActive } = useQueryWithRealtime(
    () => locationService.sharedByMe(), "location_share_grants", []
  );
  const { data: historyShares, refetch: refetchHistory } = useQueryWithRealtime(
    () => locationService.shareHistory(), "location_share_grants", []
  );

  const pending: LocationGrant[] = pendingData ?? [];
  const active = activeShares ?? [];
  const history = historyShares ?? [];

  async function respond(requesterUserId: string, approve: boolean) {
    try {
      await locationService.respond(requesterUserId, approve);
      showToast(approve ? "Location shared" : "Request denied");
      refetchPending();
      refetchActive();
    } catch {
      showToast("Couldn't update — try again");
    }
  }

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

  const nothingAtAll = pending.length === 0 && active.length === 0 && history.length === 0;

  return (
    <div className="screen screen-boxed">
      <AppBar title="Location sharing" />
      <div className="screen-scroll page-pad col gap-16 scroll-pad-end" style={{ paddingTop: 14 }}>

        {nothingAtAll && (
          <EmptyState
            emoji="📍"
            title="No one can see your location"
            text="When a neighbour asks to see where you are, the request will show up here for you to approve or deny."
          />
        )}

        {pending.length > 0 && (
          <div>
            <div className="profile-eyebrow row gap-6" style={{ alignItems: "center" }}>
              <MapPin size={13} color="var(--brand-600)" /> Requests
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
                    aria-label={`Approve ${g.requesterName}`}
                  >
                    <Check size={16} />
                  </button>
                  <button
                    className="icon-btn"
                    style={{ background: "var(--ink-100)", color: "var(--ink-600)", width: 34, height: 34 }}
                    onClick={() => respond(g.requesterUserId, false)}
                    aria-label={`Deny ${g.requesterName}`}
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {active.length > 0 && (
          <div>
            <div className="profile-eyebrow row gap-6" style={{ alignItems: "center" }}>
              <Eye size={13} color="var(--green-500)" /> Currently sharing with
            </div>
            <div className="card col gap-8" style={{ padding: 12 }}>
              {active.map((g) => {
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
                      style={{ padding: "4px 10px", background: "var(--brand-50)", color: "var(--brand-700)", border: "1px solid var(--brand-100)", fontSize: 11.5, borderRadius: 8 }}
                      onClick={() => handleRenew(g.requesterUserId)}
                    >
                      Renew
                    </button>
                    <button
                      className="btn"
                      style={{ padding: "4px 10px", background: "var(--red-50)", color: "var(--red-600)", border: "1px solid var(--red-100)", fontSize: 11.5, borderRadius: 8 }}
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

        {history.length > 0 && (
          <div>
            <div className="profile-eyebrow row gap-6" style={{ alignItems: "center" }}>
              <FileText size={13} color="var(--ink-500)" /> History
            </div>
            <div className="card col gap-8" style={{ padding: 12 }}>
              {history.map((g) => (
                <div key={g.id} className="row gap-10" style={{ alignItems: "center" }}>
                  <SafeImg src={g.requesterAvatar} variant="avatar" className="avatar" style={{ width: 32, height: 32, opacity: 0.7 }} />
                  <div className="grow">
                    <div className="semi small muted">{g.requesterName}</div>
                    <div className="tiny muted">
                      {g.status === "DENIED" ? "Request denied" : "Share revoked"} {formatRel(g.updatedAt)}
                    </div>
                  </div>
                  <span className="tiny" style={{ background: "var(--ink-100)", color: "var(--ink-600)", padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: 700 }}>
                    {g.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
