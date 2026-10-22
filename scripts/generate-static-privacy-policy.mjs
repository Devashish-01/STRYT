import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server.js";
import { createServer } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = await readFile(path.join(root, "legal/privacy-policy.md"), "utf8");
const vite = await createServer({ root, server: { middlewareMode: true }, appType: "custom" });

let content;
try {
  const { default: Markdown } = await vite.ssrLoadModule("/src/components/Markdown.tsx");
  content = renderToStaticMarkup(
    React.createElement(
      StaticRouter,
      { location: "/legal/privacy-policy" },
      React.createElement(Markdown, { source }),
    ),
  );
} finally {
  await vite.close();
}

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="index, follow">
    <title>Privacy Policy | STRYT</title>
    <meta name="description" content="Read STRYT's privacy policy, including what data we collect, how we use it, and your choices.">
    <link rel="canonical" href="https://stryt.in/legal/privacy-policy">
    <style>
      :root { --brand-700:#6724b7; --brand-400:#a881d9; --ink-900:#1b1720; --ink-800:#302b36; --ink-700:#4a4450; --ink-200:#ddd7e3; --ink-100:#f0ecf4; --ink-50:#f8f6fa; color-scheme:light; }
      * { box-sizing:border-box; }
      body { margin:0; padding:24px 18px 72px; background:#fff; color:var(--ink-900); font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif; }
      header { max-width:720px; margin:0 auto 28px; }
      header a { color:var(--brand-700); font-weight:700; text-decoration:none; }
      main a { color:var(--brand-700); }
      main { overflow-wrap:anywhere; }
      @media (min-width:768px) { body { padding-top:40px; } }
    </style>
  </head>
  <body>
    <header><a href="/">STRYT</a></header>
    <main>${content}</main>
  </body>
</html>
`;

const output = path.join(root, "dist/legal/privacy-policy.html");
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, html);
console.log(`Generated ${path.relative(root, output)} from legal/privacy-policy.md`);
