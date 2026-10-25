import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/store", () => ({ useApp: () => ({ dataSaver: false }) }));

import { SafeImg } from "./common";

const render = (props: Parameters<typeof SafeImg>[0]) => renderToStaticMarkup(createElement(SafeImg, props));
const classOf = (html: string) => /class="([^"]*)"/.exec(html)?.[1];

describe("SafeImg avatar variant", () => {
  it("is round and cropped even when the caller passes only a size", () => {
    expect(classOf(render({ src: "https://x.test/a.png", variant: "avatar", style: { width: 38, height: 38 } }))).toBe("avatar");
  });

  it("keeps the caller's own class next to it", () => {
    expect(classOf(render({ src: "https://x.test/a.png", variant: "avatar", className: "ring" }))).toBe("avatar ring");
  });

  it("does not add the class twice when the caller already passes it", () => {
    expect(classOf(render({ src: "https://x.test/a.png", variant: "avatar", className: "avatar" }))).toBe("avatar");
  });

  it("leaves a photo alone — only avatars are rounded", () => {
    expect(render({ src: "https://x.test/a.png" })).not.toContain("avatar");
  });
});
