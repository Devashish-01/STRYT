import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Bug, Mail, Send, CheckCircle2 } from "@/components/Icons";
import { AppBar } from "@/components/common";
import { useApp } from "@/store";
import { supportService, type ReporterRole } from "@/services/core/supportService";
import { useI18n } from "@/lib/i18n";
type Tab = "CONTACT" | "BUG";

const ROLE_LABELS: Record<ReporterRole, string> = {
  CUSTOMER: "Customer 🧑",
  BUSINESS: "Business owner 🏪",
  PROVIDER: "Service provider 🔧",
};

function defaultReporterRole(activeRole: string): ReporterRole {
  if (activeRole === "business_owner") return "BUSINESS";
  if (activeRole === "provider") return "PROVIDER";
  return "CUSTOMER";
}

export default function Support() {
  const nav = useNavigate();
  const { user, activeRole, showToast } = useApp();
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const [reporterRole, setReporterRole] = useState<ReporterRole>(() => defaultReporterRole(activeRole));

  // Tab state initialized from URL param if available (e.g. ?tab=bug)
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const t = searchParams.get("tab")?.toUpperCase();
    return t === "BUG" ? "BUG" : "CONTACT";
  });

  // Form states
  const [category, setCategory] = useState("COMPLAINT");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [bugDescription, setBugDescription] = useState("");

  // Submission states
  const [loading, setLoading] = useState(false);
  const [ticketSubmitted, setTicketSubmitted] = useState(false);
  const [bugSubmitted, setBugSubmitted] = useState(false);

  // Auto-fill user email if they have it (or name/phone placeholders)
  useEffect(() => {
    if (user?.phone) {
      // Set email to empty since we don't have user.email, but we can collect it.
    }
  }, [user]);

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !subject.trim() || !message.trim()) {
      showToast(t("sup_fill_required"));
      return;
    }

    setLoading(true);
    try {
      await supportService.submitTicket({
        category,
        email: email.trim(),
        subject: subject.trim(),
        message: message.trim(),
      });
      setTicketSubmitted(true);
      showToast(t("sup_sent"));
    } catch (err) {
      console.error(err);
      showToast(t("sup_send_failed"));
    } finally {
      setLoading(false);
    }
  };

  const handleBugSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bugDescription.trim()) {
      showToast(t("sup_describe_bug_first"));
      return;
    }

    setLoading(true);
    try {
      await supportService.submitBugReport({
        description: bugDescription.trim(),
        reporterRole,
      });
      setBugSubmitted(true);
      showToast(t("sup_bug_sent"));
    } catch (err) {
      console.error(err);
      showToast(t("sup_bug_failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="screen">
      {/* No hardcoded onBack — the only way in is from Settings, so forcing
          /profile skipped a level of the tree. AppBar defaults to nav(-1),
          which returns you to wherever you actually came from. */}
      <AppBar title={t("sup_title")} />

      {/* Tabs */}
      <div className="row" style={{ borderBottom: "1px solid var(--line)", background: "#fff" }}>
        <button
          onClick={() => {
            setActiveTab("CONTACT");
            setTicketSubmitted(false);
          }}
          className="semi"
          style={{
            flex: 1,
            padding: "14px 0",
            fontSize: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            color: activeTab === "CONTACT" ? "var(--brand-700)" : "var(--ink-500)",
            borderBottom: activeTab === "CONTACT" ? "2.5px solid var(--brand-700)" : "2.5px solid transparent",
          }}
        >
          <Mail size={16} />
          <span>{t("sup_contact_us")}</span>
        </button>
        <button
          onClick={() => {
            setActiveTab("BUG");
            setBugSubmitted(false);
          }}
          className="semi"
          style={{
            flex: 1,
            padding: "14px 0",
            fontSize: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            color: activeTab === "BUG" ? "var(--brand-700)" : "var(--ink-500)",
            borderBottom: activeTab === "BUG" ? "2.5px solid var(--brand-700)" : "2.5px solid transparent",
          }}
        >
          <Bug size={16} />
          <span>{t("sup_report_bug")}</span>
        </button>
      </div>

      <div className="screen-scroll page-pad fade-up col gap-16" style={{ paddingBottom: 40 }}>
        {activeTab === "CONTACT" ? (
          ticketSubmitted ? (
            <div className="card col center" style={{ padding: "40px 24px", textAlign: "center", gap: 16 }}>
              <div style={{ color: "var(--green-500)", animation: "pop 0.3s ease" }}>
                <CheckCircle2 size={56} />
              </div>
              <h3 className="bold h2">{t("sup_message_sent_heading")}</h3>
              <p className="muted small" style={{ lineHeight: 1.5, maxWidth: 300 }}>
                Thank you for contacting us. We have received your query and will reply to <strong>{email}</strong> within 24 hours.
              </p>
              <button className="btn btn-ghost btn-block" onClick={() => nav(-1)} style={{ marginTop: 8 }}>
                Done
              </button>
            </div>
          ) : (
            <form onSubmit={handleContactSubmit} className="col gap-14">
              <div className="col gap-4">
                <h3 className="bold h2" style={{ color: "var(--ink-800)" }}>{t("sup_contact_team")}</h3>
                <p className="muted small">{t("sup_contact_hint")}</p>
              </div>

              <div className="field">
                <label htmlFor="support-category">{t("category")}</label>
                <select id="support-category"
                  className="input"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  style={{ background: "#fff", appearance: "auto" }}
                >
                  <option value="COMPLAINT">{t("sup_file_complaint")}</option>
                  <option value="INQUIRY">{t("sup_inquiry")}</option>
                  <option value="ACCOUNT">{t("sup_account_issue")}</option>
                  <option value="BUSINESS">{t("sup_business_listings")}</option>
                  <option value="SUGGESTION">{t("sup_suggestion")}</option>
                </select>
              </div>

              <div className="field">
                <label htmlFor="support-your-email-address">{t("sup_your_email")}</label>
                <input id="support-your-email-address"
                  type="email"
                  className="input"
                  placeholder={t("sup_email_placeholder")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="field">
                <label htmlFor="support-subject">{t("sup_subject")}</label>
                <input id="support-subject"
                  type="text"
                  className="input"
                  placeholder={t("sup_subject_placeholder")}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  required
                />
              </div>

              <div className="field">
                <label htmlFor="support-detailed-description">{t("detailed_description_label")}</label>
                <textarea id="support-detailed-description"
                  className="input"
                  placeholder={t("sup_description_placeholder")}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  style={{ minHeight: 120 }}
                  required
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary btn-block"
                disabled={loading || !email.trim() || !subject.trim() || !message.trim()}
                style={{ marginTop: 8 }}
              >
                {loading ? "Sending..." : (
                  <>
                    <Send size={16} />
                    <span>{t("sup_send_message")}</span>
                  </>
                )}
              </button>
            </form>
          )
        ) : (
          bugSubmitted ? (
            <div className="card col center" style={{ padding: "40px 24px", textAlign: "center", gap: 16 }}>
              <div style={{ color: "var(--green-500)", animation: "pop 0.3s ease" }}>
                <CheckCircle2 size={56} />
              </div>
              <h3 className="bold h2">{t("sup_bug_logged")}</h3>
              <p className="muted small" style={{ lineHeight: 1.5, maxWidth: 300 }}>
                Your bug report has been received and added to our tracking list. We appreciate your help in improving STRYT.
              </p>
              <div className="row gap-10" style={{ width: "100%", marginTop: 8 }}>
                <button className="btn btn-outline grow" onClick={() => setBugSubmitted(false)}>
                  Report Another
                </button>
                <button className="btn btn-ghost grow" onClick={() => nav(-1)}>
                  Done
                </button>
              </div>
            </div>
          ) : (
            <div className="col gap-14">
              <div className="col gap-4">
                <h3 className="bold h2" style={{ color: "var(--ink-800)" }}>{t("sup_report_bug")}</h3>
                <p className="muted small">{t("sup_bug_hint")}</p>
              </div>

              <form onSubmit={handleBugSubmit} className="col gap-14" style={{ marginTop: 4 }}>
                <div className="field">
                  <label>{t("sup_reporting_as")}</label>
                  <div className="row gap-8">
                    {(Object.keys(ROLE_LABELS) as ReporterRole[]).map((r) => (
                      <button
                        key={r}
                        type="button"
                        className={`chip ${reporterRole === r ? "active" : ""}`}
                        style={{ flex: 1 }}
                        onClick={() => setReporterRole(r)}
                      >
                        {ROLE_LABELS[r]}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="support-describe-the-bug">{t("sup_describe_bug")}</label>
                  <textarea id="support-describe-the-bug"
                    className="input"
                    placeholder={t("sup_bug_placeholder")}
                    value={bugDescription}
                    onChange={(e) => setBugDescription(e.target.value)}
                    style={{ minHeight: 140 }}
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="btn btn-primary btn-block"
                  disabled={loading || !bugDescription.trim()}
                >
                  {loading ? "Submitting..." : (
                    <>
                      <Send size={16} />
                      <span>{t("sup_submit_bug")}</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          )
        )}
      </div>
    </div>
  );
}
