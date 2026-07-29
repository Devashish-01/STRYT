import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AppBar } from "@/components/common";
import { SettingsSection, SettingsRow } from "@/components/settings";
import { Download, Trash2, Shield } from "@/components/Icons";
import { useApp } from "@/store";
import { profileControlService, appointmentService, requestService } from "@/services";
import { ACCOUNT_DELETION_GRACE_DAYS } from "@/lib/accountDeletion";

/**
 * Your data — take a copy, or close the account.
 *
 * Delete used to live under a plural "Account Actions" heading containing a
 * single action, on a page whose adjacent copy ("Delete anytime from this
 * screen") was about location history, not the account. Both fixed here.
 */
export default function DataSettings() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { user, bookmarks, lists, follows, refreshUser, showToast } = useApp();

  const [exporting, setExporting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [submittingDelete, setSubmittingDelete] = useState(false);

  // `?action=delete` lets the hub's "Delete account" row open this screen with
  // the confirm already up, so that row costs one tap, not two.
  useEffect(() => {
    if (params.get("action") === "delete") setShowDeleteModal(true);
  }, [params]);

  /** Everything this account holds, as one JSON file. Reads go through the
   *  normal services, so RLS already scopes every row to this user. */
  async function exportData() {
    setExporting(true);
    try {
      const [appointments, myRequests] = await Promise.all([
        user.id ? appointmentService.listForCustomer(user.id) : Promise.resolve([]),
        requestService.mine().catch(() => []),
      ]);
      const payload = {
        exportedAt: new Date().toISOString(),
        profile: {
          id: user.id, name: user.name, alias: user.alias, email: user.email,
          phone: user.phone, area: user.area, language: user.language,
        },
        bookmarks, lists, follows, appointments, requests: myRequests,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `stryt-my-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast("Your data has been downloaded");
    } catch {
      showToast("Couldn't build your export — try again");
    } finally {
      setExporting(false);
    }
  }

  async function handleSubmitDeleteRequest() {
    setSubmittingDelete(true);
    try {
      await profileControlService.requestDeletion("CUSTOMER", null, deleteReason);
      setShowDeleteModal(false);
      setDeleteReason("");
      await refreshUser();
      showToast(`Account scheduled for deletion in ${ACCOUNT_DELETION_GRACE_DAYS} days`);
      nav("/auth/deletion-pending", { replace: true });
    } catch (err: any) {
      showToast(err.message || "Failed to schedule deletion");
    } finally {
      setSubmittingDelete(false);
    }
  }

  return (
    <div className="screen screen-boxed">
      <AppBar title="Your data" />
      <div className="screen-scroll page-pad col gap-16 scroll-pad-end" style={{ paddingTop: 14 }}>

        <SettingsSection title="Take a copy">
          <SettingsRow
            icon={<Download size={19} color="var(--ink-600)" />}
            label={exporting ? "Preparing…" : "Download my data"}
            hint="Your profile, saved places, lists, bookings and requests as a JSON file"
            onClick={() => { if (!exporting) void exportData(); }}
          />
        </SettingsSection>

        <SettingsSection title="Close your account">
          <SettingsRow
            icon={<Trash2 size={19} color="var(--red-600)" />}
            label="Delete account"
            hint={`Scheduled ${ACCOUNT_DELETION_GRACE_DAYS} days out — sign back in before then to cancel`}
            danger
            onClick={() => setShowDeleteModal(true)}
          />
        </SettingsSection>

        <div className="card row gap-10" style={{ padding: 14, alignItems: "flex-start" }}>
          <Shield size={18} color="var(--green-600)" style={{ flexShrink: 0, marginTop: 1 }} />
          <p className="tiny muted" style={{ lineHeight: 1.5 }}>
            Your data is yours. We store only your last known location, never a trail of
            where you've been. Deleting your account removes it along with everything else.
          </p>
        </div>
      </div>

      {showDeleteModal && (
        <div className="overlay" onClick={() => !submittingDelete && setShowDeleteModal(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-grab" />
            <h3 className="bold h2">Delete account?</h3>
            <p className="small muted" style={{ margin: "8px 0 14px", lineHeight: 1.5 }}>
              Your account will be scheduled for deletion in {ACCOUNT_DELETION_GRACE_DAYS} days.
              Sign back in before then and it's cancelled automatically — after that it's permanent.
            </p>
            <textarea
              className="input"
              style={{ minHeight: 70 }}
              placeholder="Optional: why are you leaving? (helps us improve)"
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
            />
            <div className="row gap-10" style={{ marginTop: 14 }}>
              {/* Safe option first and visually dominant — DESIGN_PRINCIPLES §7. */}
              <button className="btn btn-outline grow" disabled={submittingDelete} onClick={() => setShowDeleteModal(false)}>
                Keep my account
              </button>
              <button className="btn btn-red grow" disabled={submittingDelete} onClick={handleSubmitDeleteRequest}>
                {submittingDelete ? "Scheduling…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
