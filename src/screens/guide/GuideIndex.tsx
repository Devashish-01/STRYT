import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppBar } from "@/components/common";
import { ArrowRight, Search as SearchIcon, X } from "@/components/Icons";
import { useApp } from "@/store";
import { guideDocsForRole, ALL_GUIDE_DOCS, type GuideRole } from "@/lib/guideDocs";

const TABS: { role: GuideRole; label: string }[] = [
  { role: "customer", label: "Customer" },
  { role: "business", label: "Business" },
  { role: "provider", label: "Provider" },
];

// Mirrors Support.tsx's defaultReporterRole() — same activeRole values, same
// intent: land the user on the section that matches whichever "hat" they're
// currently wearing, since a business owner and a customer rarely share questions.
function defaultRole(activeRole: string): GuideRole {
  if (activeRole === "business_owner") return "business";
  if (activeRole === "provider") return "provider";
  return "customer";
}

// Public index of the STRYT user guide & FAQ (routed at /guide). Content is
// bundled markdown (see lib/guideDocs.ts) — search is a plain client-side
// filter since everything is already in memory, no network round-trip needed.
export default function GuideIndex() {
  const nav = useNavigate();
  const { activeRole } = useApp();
  const [role, setRole] = useState<GuideRole>(() => defaultRole(activeRole));
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q) return guideDocsForRole(role);
    // A non-empty search spans every role — narrowing to one tab while typing
    // would hide a correct answer just because it lives under a different hat.
    return ALL_GUIDE_DOCS
      .filter((d) => d.title.toLowerCase().includes(q) || d.content.toLowerCase().includes(q))
      .map(({ slug, title, role }) => ({ slug, title, role }));
  }, [role, q]);

  return (
    <div className="screen">
      <AppBar title="Guide & FAQ" onBack={() => nav(-1)} />
      <div className="screen-scroll page-pad" style={{ paddingBottom: 48 }}>
        <p style={{ fontSize: 13.5, color: "var(--ink-600)", lineHeight: 1.6, margin: "4px 0 16px" }}>
          Quick answers for every part of STRYT — how to book, how payments work, running your shop or provider profile, and more.
        </p>

        <div style={{ position: "relative", marginBottom: 14 }}>
          <SearchIcon size={16} color="var(--ink-400)" style={{ position: "absolute", left: 12, top: 12 }} />
          <input
            type="text"
            className="input"
            placeholder="Search the guide…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 14px 10px 36px",
              fontSize: 14,
              background: "var(--ink-50)",
              border: "1.5px solid var(--ink-200)",
              borderRadius: 14,
              color: "var(--ink-900)",
            }}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              style={{ position: "absolute", right: 10, top: 9, background: "none", border: "none", cursor: "pointer" }}
            >
              <X size={16} color="var(--ink-400)" />
            </button>
          )}
        </div>

        {!q && (
          <div className="row gap-8" style={{ marginBottom: 16 }}>
            {TABS.map((tab) => (
              <button
                key={tab.role}
                type="button"
                onClick={() => setRole(tab.role)}
                style={{
                  padding: "7px 14px",
                  borderRadius: 999,
                  border: "none",
                  background: role === tab.role ? "var(--brand-600)" : "var(--ink-100)",
                  color: role === tab.role ? "#fff" : "var(--ink-700)",
                  fontWeight: role === tab.role ? 700 : 600,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {results.length === 0 ? (
          <div className="col center" style={{ padding: "40px 16px", textAlign: "center", gap: 6 }}>
            <span style={{ fontSize: 28 }}>🔍</span>
            <span className="tiny muted">No articles match "{query}" — try a different word, or Contact Support.</span>
          </div>
        ) : (
          <div className="col gap-8">
            {results.map((d) => (
              <button
                key={d.slug}
                type="button"
                onClick={() => nav(`/guide/${d.slug}`)}
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
                <span className="row gap-8 center-v">
                  {q && <span className="tiny" style={{ color: "var(--ink-400)", fontWeight: 600, textTransform: "capitalize" }}>{d.role}</span>}
                  <span>{d.title}</span>
                </span>
                <ArrowRight size={16} color="var(--ink-400)" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
