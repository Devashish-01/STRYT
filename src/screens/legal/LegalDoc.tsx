import { useParams, useNavigate } from "react-router-dom";
import { AppBar } from "@/components/common";
import Markdown from "@/components/Markdown";
import { getLegalDoc } from "@/lib/legalDocs";
import { LEGAL_ROUTES } from "@/lib/legal";

// Public, un-gated viewer for a single bundled policy document (routed at
// /legal/:slug). Reachable while the Terms-acceptance gate is outstanding — that
// is the whole point: a user must be able to read the documents before agreeing.
export default function LegalDoc() {
  const { slug } = useParams<{ slug: string }>();
  const nav = useNavigate();
  const doc = slug ? getLegalDoc(slug) : null;

  return (
    <div className="screen">
      <AppBar title={doc?.title ?? "Legal"} onBack={() => nav(-1)} />
      <div className="screen-scroll page-pad" style={{ paddingBottom: 48 }}>
        {doc ? (
          <Markdown source={doc.content} />
        ) : (
          <div className="col center" style={{ padding: "48px 16px", textAlign: "center", gap: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink-800)" }}>Document not found</div>
            <button
              type="button"
              onClick={() => nav(LEGAL_ROUTES.index)}
              style={{ background: "none", border: "none", color: "var(--brand-700)", fontWeight: 700, cursor: "pointer" }}
            >
              View all policies
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
