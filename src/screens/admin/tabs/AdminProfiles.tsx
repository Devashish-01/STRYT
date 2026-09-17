import { useState, useEffect } from "react";
import { EmptyState } from "@/components/common";
import { profileControlService, type DeletionRequest } from "@/services/core/profileControlService";
import { ACCOUNT_DELETION_GRACE_DAYS } from "@/lib/accountDeletion";
import { notificationService } from "@/services/engagement/notificationService";
import { ListSkeleton } from "@/components/states";
import { AlertTriangle } from "@/components/Icons";
import { useApp } from "@/store";
import { getSupabase } from "@/lib/supabaseClient";

export function AdminProfiles() {
  const { showToast, user: currentAdmin } = useApp();
  const [subTab, setSubTab] = useState<"directory" | "requests">("directory");
  const [searchType, setSearchType] = useState<"CUSTOMER" | "BUSINESS" | "PROVIDER">("CUSTOMER");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[]>([]);

  // Deletion Queue
  const [requests, setRequests] = useState<DeletionRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);

  // Deletion Modal
  const [selectedProfile, setSelectedProfile] = useState<any | null>(null);
  const [profileType, setProfileType] = useState<"CUSTOMER" | "BUSINESS" | "PROVIDER">("CUSTOMER");
  const [deleteReason, setDeleteReason] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const isSuperAdmin = (currentAdmin.roles as string[]).includes("super_admin");

  useEffect(() => {
    if (subTab === "requests") {
      void loadRequests();
    } else if (subTab === "directory" && !searchQuery.trim()) {
      void loadRecent();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subTab, searchType]);

  // Directory defaults to the most recent signups so an admin can browse and
  // spot someone (e.g. a Google sign-in with no phone on file) without
  // already knowing a search term that matches them.
  async function loadRecent() {
    setLoading(true);
    try {
      const sb = getSupabase();
      if (searchType === "CUSTOMER") {
        // admin_recent_users() is a SECURITY DEFINER RPC that checks the
        // caller is actually an admin internally — customer PII columns
        // aren't selectable via a plain query anymore (ISS-009).
        const { data, error } = await sb.rpc("admin_recent_users");
        if (error) throw error;
        setResults(data || []);
      } else if (searchType === "BUSINESS") {
        const { data, error } = await sb.from("businesses").select("*").order("created_at", { ascending: false }).limit(30);
        if (error) throw error;
        setResults(data || []);
      } else if (searchType === "PROVIDER") {
        const { data, error } = await sb.from("providers").select("*").order("created_at", { ascending: false }).limit(30);
        if (error) throw error;
        setResults(data || []);
      }
    } catch (e: any) {
      showToast("Couldn't load recent signups: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadRequests() {
    setLoadingRequests(true);
    try {
      const data = await profileControlService.getDeletionRequests();
      setRequests(data);
    } catch (e: any) {
      showToast("Failed to load requests: " + e.message);
    } finally {
      setLoadingRequests(false);
    }
  }

  async function runSearch() {
    if (!searchQuery.trim()) {
      void loadRecent();
      return;
    }
    setLoading(true);
    try {
      const sb = getSupabase();
      const term = `%${searchQuery.trim()}%`;
      if (searchType === "CUSTOMER") {
        // admin_search_users() is a SECURITY DEFINER RPC — checks the caller
        // is actually an admin internally, and matches name/phone/email so
        // Google sign-ins (no phone on file) are findable (ISS-009 / ISS-F14).
        const { data, error } = await sb.rpc("admin_search_users", { term: searchQuery.trim() });
        if (error) throw error;
        setResults(data || []);
      } else if (searchType === "BUSINESS") {
        const { data, error } = await sb.from("businesses").select("*").ilike("name", term).limit(20);
        if (error) throw error;
        setResults(data || []);
      } else if (searchType === "PROVIDER") {
        const { data, error } = await sb.from("providers").select("*").ilike("display_name", term).limit(20);
        if (error) throw error;
        setResults(data || []);
      }
    } catch (e: any) {
      showToast("Search failed: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleSuspension(item: any, isSuspended: boolean) {
    try {
      const sb = getSupabase();
      const newStatus = isSuspended ? "SUSPENDED" : "ACTIVE";
      const table = searchType === "BUSINESS" ? "businesses" : "providers";
      const { error } = await sb.from(table).update({ status: newStatus }).eq("id", item.id);
      if (error) throw error;
      showToast(isSuspended ? "Profile suspended" : "Profile activated");

      const ownerId = item.owner_user_id as string | undefined;
      const entityName = item.name || item.display_name || "Your listing";
      if (ownerId) {
        const manageLink = searchType === "BUSINESS" ? `/business/${item.id}/manage` : `/provider/${item.id}/manage`;
        void notificationService.send(
          ownerId,
          isSuspended ? "Account suspended" : "Account reactivated",
          isSuspended
            ? `${entityName} has been suspended by STRYT admin. You can raise a review request from your dashboard.`
            : `${entityName} is active again — you're back on STRYT.`,
          manageLink,
          "SYSTEM"
        );
      }
      void runSearch();
    } catch (e: any) {
      showToast("Failed to update status: " + e.message);
    }
  }

  async function handleDelete() {
    if (!selectedProfile) return;
    if (!deleteReason.trim()) {
      showToast("Please provide a reason");
      return;
    }
    const name = selectedProfile.name || selectedProfile.display_name || "User";
    const expected = `DELETE ${name}`;
    if (confirmText !== expected) {
      showToast(`Confirmation text must match: "${expected}"`);
      return;
    }

    setDeleting(true);
    try {
      await profileControlService.adminDeleteProfile(
        profileType,
        selectedProfile.id,
        deleteReason,
        confirmText
      );
      showToast("Profile permanently deleted");
      setSelectedProfile(null);
      setDeleteReason("");
      setConfirmText("");
      void runSearch();
      if (subTab === "requests") void loadRequests();
    } catch (err: any) {
      showToast(err.message || "Deletion failed");
    } finally {
      setDeleting(false);
    }
  }

  async function handleRejectRequest(requestId: string) {
    try {
      await profileControlService.updateRequestStatus(requestId, "REJECTED");
      showToast("Request rejected");
      void loadRequests();
    } catch (e: any) {
      showToast("Failed to reject: " + e.message);
    }
  }

  return (
    <div className="col gap-12" style={{ paddingTop: 12 }}>
      {/* Sub tabs */}
      <div className="row gap-8 page-pad" style={{ borderBottom: "1px solid var(--line)", paddingBottom: 10 }}>
        <button
          className={`chip ${subTab === "directory" ? "active" : ""}`}
          onClick={() => setSubTab("directory")}
        >
          Directory Search
        </button>
        <button
          className={`chip ${subTab === "requests" ? "active" : ""}`}
          onClick={() => setSubTab("requests")}
        >
          Scheduled deletions
        </button>
      </div>

      {subTab === "directory" && (
        <div className="page-pad col gap-12">
          {/* Controls */}
          <div className="card col gap-10" style={{ padding: 12 }}>
            <div className="row gap-8">
              <select
                className="input"
                value={searchType}
                onChange={(e) => setSearchType(e.target.value as any)}
                style={{ width: 110, fontSize: 13 }}
              >
                <option value="CUSTOMER">Customer</option>
                <option value="BUSINESS">Business</option>
                <option value="PROVIDER">Provider</option>
              </select>
              <input
                className="input grow"
                placeholder={searchType === "CUSTOMER" ? "Name, phone, or email... (blank = recent)" : "Search by name..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void runSearch()}
                style={{ fontSize: 13 }}
              />
              <button className="btn btn-dark btn-sm" onClick={runSearch}>Search</button>
            </div>
          </div>

          {loading ? (
            <ListSkeleton count={2} />
          ) : results.length === 0 ? (
            <EmptyState emoji="🔍" title="No profiles found" text="Try a different name, phone number, or email." />
          ) : (
            <div className="col gap-10">
              {results.map((item) => {
                const name = item.name || item.display_name || "Unknown";
                const isSuspended = item.status === "SUSPENDED";
                const isDeleted = item.deleted_at || item.customer_deleted_at;
                const isEnabled = item.customer_enabled !== false && item.owner_enabled !== false;
                
                return (
                  <div key={item.id} className="card col gap-10" style={{ padding: 12, opacity: isDeleted ? 0.6 : 1 }}>
                    <div className="row between align-start">
                      <div>
                        <div className="semi small row gap-6 align-center">
                          {name}
                          {isDeleted && <span className="badge badge-red">Deleted</span>}
                          {isSuspended && <span className="badge badge-purple">Suspended</span>}
                          {!isEnabled && !isDeleted && <span className="badge badge-gray">Hidden</span>}
                        </div>
                        <div className="tiny muted" style={{ marginTop: 2 }}>ID: {item.id}</div>
                        {searchType === "CUSTOMER" && (
                          <div className="tiny muted" style={{ marginTop: 2 }}>
                            {item.phone || "No phone (Google sign-in)"}{item.email ? ` · ${item.email}` : ""}
                          </div>
                        )}
                      </div>
                      
                      <div className="row gap-6">
                        {(searchType === "BUSINESS" || searchType === "PROVIDER") && !isDeleted && (
                          <button
                            className={`btn btn-sm ${isSuspended ? "btn-outline" : "btn-outline-danger"}`}
                            onClick={() => handleToggleSuspension(item, !isSuspended)}
                            style={{ fontSize: 11, padding: "4px 8px" }}
                          >
                            {isSuspended ? "Activate" : "Suspend"}
                          </button>
                        )}
                        <button
                          className="btn btn-red btn-sm"
                          onClick={() => {
                            setProfileType(searchType);
                            setSelectedProfile(item);
                          }}
                          disabled={searchType === "CUSTOMER" && !isSuperAdmin}
                          style={{ fontSize: 11, padding: "4px 8px" }}
                          title={searchType === "CUSTOMER" && !isSuperAdmin ? "Requires Super Admin" : ""}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {subTab === "requests" && (
        <div className="page-pad col gap-12">
          {loadingRequests ? (
            <ListSkeleton count={2} />
          ) : requests.length === 0 ? (
            <EmptyState emoji="✅" title="Queue clear" text="No scheduled self-serve deletions." />
          ) : (
            <div className="col gap-10">
              {requests.map((req) => {
                const reqDate = new Date(req.createdAt);
                const purgeDate = new Date(reqDate.getTime() + ACCOUNT_DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000);
                const daysLeft = Math.max(0, Math.ceil((purgeDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
                const isReadyToPurge = daysLeft <= 0;

                return (
                  <div key={req.id} className="card col gap-8" style={{ padding: 12 }}>
                    <div className="row between align-start">
                      <div>
                        <div className="semi small">{req.user?.name || "Unknown User"}</div>
                        <div className="tiny muted">Target: {req.targetType} {req.targetId ? `(${req.targetId})` : ""}</div>
                        <div className="tiny muted">Submitted: {reqDate.toLocaleDateString()}</div>
                      </div>
                      <div className="col align-end gap-4">
                        <span className={`badge ${req.status === "PENDING" ? "badge-gray" : req.status === "COMPLETED" ? "badge-green" : "badge-red"}`}>
                          {req.status}
                        </span>
                        {req.status === "PENDING" && (
                          isReadyToPurge ? (
                            <span style={{ background: "var(--red-100)", color: "var(--red-600)", padding: "2px 6px", borderRadius: 6, fontWeight: 700, fontSize: 10.5 }}>
                              Ready to Purge
                            </span>
                          ) : (
                            <span style={{ background: "var(--amber-100)", color: "var(--amber-700)", padding: "2px 6px", borderRadius: 6, fontWeight: 700, fontSize: 10.5 }}>
                              Grace Period: {daysLeft}d left
                            </span>
                          )
                        )}
                      </div>
                    </div>
                    {req.reason && (
                      <div className="tiny muted" style={{ background: "var(--ink-100)", padding: 6, borderRadius: 6 }}>
                        "{req.reason}"
                      </div>
                    )}
                    {req.status === "PENDING" && (
                      <div className="row gap-8" style={{ marginTop: 4 }}>
                        <button className="btn btn-outline grow btn-sm" onClick={() => handleRejectRequest(req.id)}>
                          Reject
                        </button>
                        <button
                          className="btn btn-red grow btn-sm"
                          onClick={() => {
                            setProfileType(req.targetType);
                            setSelectedProfile({ id: req.targetId || req.userId, name: req.user?.name || "User" });
                          }}
                          disabled={req.targetType === "CUSTOMER" && !isSuperAdmin}
                          title={req.targetType === "CUSTOMER" && !isSuperAdmin ? "Requires Super Admin" : ""}
                        >
                          Review & Delete
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {selectedProfile && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div className="card col gap-12" style={{ maxWidth: 450, width: "100%", padding: 16, background: "var(--ink-50)", boxShadow: "var(--shadow-lg)" }}>
            <div className="row gap-8 text-danger align-center">
              <AlertTriangle size={24} color="var(--red-600)" />
              <h3 className="bold h2" style={{ color: "var(--red-600)" }}>Confirm Deletion</h3>
            </div>
            
            <p className="small muted">
              You are about to permanently delete <strong>{selectedProfile.name || selectedProfile.display_name || "this profile"}</strong> ({profileType}).
            </p>

            <div className="col gap-6" style={{ background: "var(--red-50)", border: "1px solid var(--red-100)", padding: 10, borderRadius: 8 }}>
              <span className="tiny bold" style={{ color: "var(--red-600)" }}>IMPACT PREVIEW:</span>
              <ul className="tiny col gap-4" style={{ listStyleType: "disc", paddingLeft: 16, color: "var(--red-600)", lineHeight: 1.4 }}>
                {profileType === "BUSINESS" && (
                  <>
                    <li>Deletes all Catalog Items associated with the business.</li>
                    <li>Deletes all Offers and Promotion codes.</li>
                    <li>Deletes all posted Business Stories.</li>
                    <li>Suspends and disables the business profile.</li>
                  </>
                )}
                {profileType === "PROVIDER" && (
                  <>
                    <li>Deletes all Portfolio Items and photos.</li>
                    <li>Deletes all Provider Packages.</li>
                    <li>Deletes KYC Documents from Storage bucket.</li>
                    <li>Suspends and disables the provider profile.</li>
                  </>
                )}
                {profileType === "CUSTOMER" && (
                  <>
                    <li>Deletes all owned Businesses and Providers first.</li>
                    <li>Anonymizes user personal details (name, phone, avatar).</li>
                    <li>Deletes all files under user storage directory.</li>
                    <li>Removes Supabase Auth identity from project completely.</li>
                  </>
                )}
              </ul>
            </div>

            <textarea
              className="input"
              placeholder="Reason for deletion (written to audit log)..."
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              style={{ minHeight: 60, width: "100%", padding: 8, borderRadius: 8, fontSize: 13, border: "1px solid var(--line)", background: "transparent", color: "inherit" }}
            />

            <div className="col gap-4">
              <label htmlFor="adminpanel-below" className="tiny muted">To confirm, type <strong>DELETE {selectedProfile.name || selectedProfile.display_name || "User"}</strong> below:</label>
              <input id="adminpanel-below"
                className="input"
                placeholder={`DELETE ${selectedProfile.name || selectedProfile.display_name || "User"}`}
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                style={{ fontSize: 13 }}
              />
            </div>

            <div className="row gap-10" style={{ marginTop: 10 }}>
              <button className="btn btn-outline btn-sm grow" onClick={() => { setSelectedProfile(null); setConfirmText(""); setDeleteReason(""); }} disabled={deleting}>
                Cancel
              </button>
              <button
                className="btn btn-red btn-sm grow"
                onClick={handleDelete}
                disabled={deleting || !deleteReason.trim() || confirmText !== `DELETE ${selectedProfile.name || selectedProfile.display_name || "User"}`}
              >
                {deleting ? "Deleting..." : "Permanently Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
