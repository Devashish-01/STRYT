import { useNavigate } from "react-router-dom";
import { AppBar } from "@/components/common";
import { ArrowRight } from "@/components/Icons";
import { LEGAL_DOCS } from "@/lib/legalDocs";

// Public index of every STRYT policy document (routed at /legal). Link to this
// from Account settings so users can find the policies any time.
export default function LegalIndex() {
  const nav = useNavigate();

  return (
    <div className="screen">
      <AppBar title="Legal & Policies" onBack={() => nav(-1)} />
      <div className="screen-scroll page-pad" style={{ paddingBottom: 48 }}>
        <p style={{ fontSize: 13.5, color: "var(--ink-600)", lineHeight: 1.6, margin: "4px 0 16px" }}>
          The terms and policies that govern your use of STRYT. Tap any to read it in full.
        </p>
        <div className="col gap-8">
          {LEGAL_DOCS.map((d) => (
            <button
              key={d.slug}
              type="button"
              onClick={() => nav(`/legal/${d.slug}`)}
              className="row space-between center-v"
              style={{
                width: "100%",
                padding: "14px 16px",
                background: "var(--ink-50)",
                border: "1px solid var(--ink-200)",
                borderRadius: 14,
                cursor: "pointer",
                textAlign: "left",
                color: "var(--ink-900)",
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              <span>{d.title}</span>
              <ArrowRight size={16} color="var(--ink-400)" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
