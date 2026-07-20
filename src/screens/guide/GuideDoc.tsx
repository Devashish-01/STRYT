import { useParams, useNavigate } from "react-router-dom";
import { AppBar } from "@/components/common";
import Markdown from "@/components/Markdown";
import { getGuideDoc } from "@/lib/guideDocs";

// Public, un-gated viewer for a single bundled guide/FAQ article (routed at
// /guide/:slug) — mirrors screens/legal/LegalDoc.tsx exactly, but points
// Markdown's cross-link rewriting at /guide instead of /legal.
export default function GuideDoc() {
  const { slug } = useParams<{ slug: string }>();
  const nav = useNavigate();
  const doc = slug ? getGuideDoc(slug) : null;

  return (
    <div className="screen">
      <AppBar title={doc?.title ?? "Guide"} onBack={() => nav(-1)} />
      <div className="screen-scroll page-pad" style={{ paddingBottom: 48 }}>
        {doc ? (
          <Markdown source={doc.content} basePath="/guide" />
        ) : (
          <div className="col center" style={{ padding: "48px 16px", textAlign: "center", gap: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink-800)" }}>Article not found</div>
            <button
              type="button"
              onClick={() => nav("/guide")}
              style={{ background: "none", border: "none", color: "var(--brand-700)", fontWeight: 700, cursor: "pointer" }}
            >
              Browse the guide
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
