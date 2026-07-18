import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Bug, Mail, Send, CheckCircle2 } from "@/components/Icons";
import { AppBar } from "@/components/common";
import { useApp } from "@/store";
import { supportService, type ReporterRole } from "@/services/core/supportService";
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
      showToast("Please fill in all required fields.");
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
      showToast("Message sent successfully!");
    } catch (err) {
      console.error(err);
      showToast("Failed to send message. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleBugSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bugDescription.trim()) {
      showToast("Please describe the bug before submitting.");
      return;
    }

    setLoading(true);
    try {
      await supportService.submitBugReport({
        description: bugDescription.trim(),
        reporterRole,
      });
      setBugSubmitted(true);
      showToast("Bug reported successfully!");
    } catch (err) {
      console.error(err);
      showToast("Failed to submit bug report. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="screen">
      <AppBar title="Help & Support" onBack={() => nav("/profile")} />

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
          <span>Contact Us</span>
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
          <span>Report a Bug</span>
        </button>
      </div>

      <div className="screen-scroll page-pad fade-up col gap-16" style={{ paddingBottom: 40 }}>
        {activeTab === "CONTACT" ? (
          ticketSubmitted ? (
            <div className="card col center" style={{ padding: "40px 24px", textAlign: "center", gap: 16 }}>
              <div style={{ color: "var(--green-500)", animation: "pop 0.3s ease" }}>
                <CheckCircle2 size={56} />
              </div>
              <h3 className="bold h2">Message Sent!</h3>
              <p className="muted small" style={{ lineHeight: 1.5, maxWidth: 300 }}>
                Thank you for contacting us. We have received your query and will reply to <strong>{email}</strong> within 24 hours.
              </p>
              <button className="btn btn-ghost btn-block" onClick={() => nav("/profile")} style={{ marginTop: 8 }}>
                Back to Profile
              </button>
            </div>
          ) : (
            <form onSubmit={handleContactSubmit} className="col gap-14">
              <div className="col gap-4">
                <h3 className="bold h2" style={{ color: "var(--ink-800)" }}>Contact the Team</h3>
                <p className="muted small">Send us a message, complaint, or feedback about STRYT.</p>
              </div>

              <div className="field">
                <label>Category</label>
                <select
                  className="input"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  style={{ background: "#fff", appearance: "auto" }}
                >
                  <option value="COMPLAINT">File a Complaint ⚠️</option>
                  <option value="INQUIRY">General Inquiry 💬</option>
                  <option value="ACCOUNT">Account Issue 👤</option>
                  <option value="BUSINESS">Business Listings 🏪</option>
                  <option value="SUGGESTION">Suggestion/Feedback 💡</option>
                </select>
              </div>

              <div className="field">
                <label>Your Email Address</label>
                <input
                  type="email"
                  className="input"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="field">
                <label>Subject</label>
                <input
                  type="text"
                  className="input"
                  placeholder="Brief summary of the issue"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  required
                />
              </div>

              <div className="field">
                <label>Detailed Description</label>
                <textarea
                  className="input"
                  placeholder="Explain the complaint or issue in detail. If this is a complaint about a user or transaction, please provide relevant IDs or names."
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
                    <span>Send Message</span>
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
              <h3 className="bold h2">Bug Logged!</h3>
              <p className="muted small" style={{ lineHeight: 1.5, maxWidth: 300 }}>
                Your bug report has been received and added to our tracking list. We appreciate your help in improving STRYT.
              </p>
              <div className="row gap-10" style={{ width: "100%", marginTop: 8 }}>
                <button className="btn btn-outline grow" onClick={() => setBugSubmitted(false)}>
                  Report Another
                </button>
                <button className="btn btn-ghost grow" onClick={() => nav("/profile")}>
                  Profile
                </button>
              </div>
            </div>
          ) : (
            <div className="col gap-14">
              <div className="col gap-4">
                <h3 className="bold h2" style={{ color: "var(--ink-800)" }}>Report a Bug</h3>
                <p className="muted small">Help us squish bugs! Describe what happened and we'll get it fixed.</p>
              </div>

              <form onSubmit={handleBugSubmit} className="col gap-14" style={{ marginTop: 4 }}>
                <div className="field">
                  <label>Reporting as</label>
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
                  <label>Describe the Bug</label>
                  <textarea
                    className="input"
                    placeholder="What happened? What screen were you on? (e.g. 'on the map screen when I touch on...')"
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
                      <span>Submit Bug Report</span>
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
