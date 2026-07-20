import { Link } from "react-router-dom";
import type { CSSProperties, ReactNode } from "react";

// A small, dependency-free markdown renderer scoped to what STRYT's bundled
// long-form content (legal policies, guide/FAQ articles) actually uses:
// headings, horizontal rules, blockquotes, unordered lists, tables, paragraphs,
// and inline bold/italic/code/links. Cross-document links written as
// "(something.md)" are rewritten to `${basePath}/something` — pass basePath
// "/legal" (the default) for policy docs or "/guide" for guide/FAQ articles, so
// each document set's cross-links resolve within its own section; mailto:/
// http(s) links open externally. All colours come from design tokens (no
// hardcoded hex) so the color linter passes.

const linkStyle: CSSProperties = { color: "var(--brand-700)", fontWeight: 600, textDecoration: "underline" };
const codeStyle: CSSProperties = {
  background: "var(--ink-100)", borderRadius: 6, padding: "1px 5px",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "0.9em",
};

function mdLinkToHref(raw: string, basePath: string): string {
  const href = raw.trim();
  // Sibling document reference, e.g. "privacy-policy.md" or "./privacy-policy.md"
  if (/\.md$/i.test(href) && !/^https?:/i.test(href)) {
    return basePath + "/" + href.replace(/^\.\//, "").replace(/\.md$/i, "");
  }
  return href;
}

function renderInline(text: string, kp: string, basePath: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|\*[^*\s][^*]*\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const tok = m[0];
    const key = kp + "-" + i;
    if (tok.startsWith("**")) {
      nodes.push(<strong key={key}>{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith("`")) {
      nodes.push(<code key={key} style={codeStyle}>{tok.slice(1, -1)}</code>);
    } else if (tok.startsWith("[")) {
      const mm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok);
      if (mm) {
        const label = mm[1];
        const href = mdLinkToHref(mm[2], basePath);
        if (href.startsWith("/")) {
          nodes.push(<Link key={key} to={href} style={linkStyle}>{label}</Link>);
        } else {
          nodes.push(
            <a key={key} href={href} target="_blank" rel="noopener noreferrer" style={linkStyle}>{label}</a>
          );
        }
      } else {
        nodes.push(tok);
      }
    } else {
      nodes.push(<em key={key}>{tok.slice(1, -1)}</em>);
    }
    last = m.index + tok.length;
    i++;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

const H_STYLES: Record<number, CSSProperties> = {
  1: { fontSize: 24, fontWeight: 800, color: "var(--ink-900)", margin: "8px 0 12px", lineHeight: 1.25 },
  2: { fontSize: 19, fontWeight: 800, color: "var(--ink-900)", margin: "24px 0 10px", lineHeight: 1.3 },
  3: { fontSize: 16, fontWeight: 700, color: "var(--ink-800)", margin: "18px 0 8px", lineHeight: 1.35 },
  4: { fontSize: 14, fontWeight: 700, color: "var(--ink-700)", margin: "14px 0 6px" },
};

function cells(row: string): string[] {
  return row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}

export default function Markdown({ source, basePath = "/legal" }: { source: string; basePath?: string }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let k = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i++; continue; }

    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const lvl = Math.min(h[1].length, 4);
      const Tag = (["h1", "h2", "h3", "h4"][lvl - 1] || "h4") as "h1" | "h2" | "h3" | "h4";
      blocks.push(<Tag key={k} style={H_STYLES[lvl]}>{renderInline(h[2], "h" + k, basePath)}</Tag>);
      k++; i++; continue;
    }

    if (/^---+$/.test(line.trim())) {
      blocks.push(<hr key={k} style={{ border: "none", borderTop: "1px solid var(--ink-200)", margin: "18px 0" }} />);
      k++; i++; continue;
    }

    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, "")); i++; }
      blocks.push(
        <blockquote key={k} style={{
          margin: "12px 0", padding: "10px 14px", background: "var(--ink-50)",
          borderLeft: "3px solid var(--brand-400)", borderRadius: "0 10px 10px 0",
          color: "var(--ink-700)", fontSize: 13.5, lineHeight: 1.6,
        }}>
          {renderInline(buf.join(" "), "bq" + k, basePath)}
        </blockquote>
      );
      k++; continue;
    }

    if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
      const rows: string[] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) { rows.push(lines[i]); i++; }
      const header = cells(rows[0]);
      const body = rows.slice(2).map(cells);
      blocks.push(
        <div key={k} style={{ overflowX: "auto", margin: "12px 0" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
            <thead>
              <tr>{header.map((c, ci) => (
                <th key={ci} style={{ textAlign: "left", padding: "8px 10px", background: "var(--ink-50)", borderBottom: "2px solid var(--ink-200)", color: "var(--ink-800)", fontWeight: 700, whiteSpace: "nowrap" }}>
                  {renderInline(c, "th" + k + ci, basePath)}
                </th>
              ))}</tr>
            </thead>
            <tbody>
              {body.map((row, ri) => (
                <tr key={ri}>{row.map((c, ci) => (
                  <td key={ci} style={{ padding: "8px 10px", borderBottom: "1px solid var(--ink-100)", color: "var(--ink-700)", verticalAlign: "top" }}>
                    {renderInline(c, "td" + k + ri + ci, basePath)}
                  </td>
                ))}</tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      k++; continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*[-*]\s+/, "")); i++; }
      blocks.push(
        <ul key={k} style={{ margin: "8px 0", paddingLeft: 22, color: "var(--ink-700)", fontSize: 14, lineHeight: 1.6 }}>
          {items.map((it, ix) => <li key={ix} style={{ marginBottom: 4 }}>{renderInline(it, "li" + k + ix, basePath)}</li>)}
        </ul>
      );
      k++; continue;
    }

    // Paragraph: accumulate consecutive plain lines.
    const buf: string[] = [line];
    i++;
    while (
      i < lines.length && lines[i].trim() &&
      !/^(#{1,6}\s|>\s?|\s*[-*]\s|\s*\|)/.test(lines[i]) &&
      !/^---+$/.test(lines[i].trim())
    ) { buf.push(lines[i]); i++; }
    blocks.push(
      <p key={k} style={{ margin: "0 0 12px", color: "var(--ink-700)", fontSize: 14, lineHeight: 1.65 }}>
        {renderInline(buf.join(" "), "p" + k, basePath)}
      </p>
    );
    k++;
  }

  return <div style={{ maxWidth: 720, margin: "0 auto" }}>{blocks}</div>;
}
