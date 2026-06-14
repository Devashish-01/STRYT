import { useState } from "react";
import { Flag } from "lucide-react";
import { useApp } from "@/store";
import type { BookmarkTarget } from "@/types";
import { adminService } from "@/services/adminService";

const reasons = [
  ["SPAM", "Spam or misleading"],
  ["SCAM", "Looks like a scam"],
  ["OFFENSIVE", "Offensive content"],
  ["FAKE", "Fake listing"],
  ["WRONG_CATEGORY", "Wrong category"],
  ["OTHER", "Something else"],
];

export default function ReportSheet({
  targetType,
  targetId,
  name,
  onClose,
}: {
  targetType: BookmarkTarget | "PROPOSAL" | "USER";
  targetId: string;
  name: string;
  onClose: () => void;
}) {
  const { showToast } = useApp();
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState("");

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <div className="row gap-8" style={{ marginBottom: 4 }}>
          <Flag size={20} color="#ef4444" />
          <h3 className="bold" style={{ fontSize: 18 }}>Report {name}</h3>
        </div>
        <p className="small muted" style={{ marginBottom: 14 }}>
          Your report is anonymous and goes to our moderation team.
        </p>

        <div className="col gap-8">
          {reasons.map(([val, label]) => (
            <button
              key={val}
              className="row between"
              style={{
                padding: "13px 14px",
                borderRadius: 12,
                border: reason === val ? "2px solid var(--brand-600)" : "1.5px solid var(--ink-200)",
                background: reason === val ? "var(--brand-50)" : "#fff",
                textAlign: "left",
              }}
              onClick={() => setReason(val)}
            >
              <span className="semi small">{label}</span>
              <span
                style={{
                  width: 18, height: 18, borderRadius: "50%",
                  border: reason === val ? "5px solid var(--brand-600)" : "2px solid var(--ink-300)",
                }}
              />
            </button>
          ))}
        </div>

        <textarea
          className="input"
          style={{ marginTop: 12, minHeight: 70 }}
          placeholder="Add details (optional)"
          value={details}
          onChange={(e) => setDetails(e.target.value)}
        />

        <button
          className="btn btn-block"
          style={{ marginTop: 14, background: reason ? "#ef4444" : "var(--ink-200)", color: "#fff" }}
          disabled={!reason}
          onClick={async () => {
            try {
              await adminService.submitReport({
                targetType,
                targetId,
                targetName: name,
                reason: reason!,
                details,
              });
              showToast("Report submitted. Thank you.");
            } catch (err: any) {
              console.error("Error submitting report:", err);
              showToast("Error submitting report. Try again.");
            }
            onClose();
          }}
        >
          Submit report
        </button>
      </div>
    </div>
  );
}
