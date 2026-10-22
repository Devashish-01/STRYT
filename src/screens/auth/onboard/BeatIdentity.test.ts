import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Rendered on the server with the hooks stubbed — checks which fields a person is actually asked for.
vi.mock("@/store", () => ({ useApp: () => ({ showToast: vi.fn() }) }));
vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({ t: (k: string) => k, tf: (k: string) => k, lang: "en", setLang: vi.fn() }),
  LANG_LABELS: { en: "English" },
}));
vi.mock("@/services", () => ({ uploadService: { upload: vi.fn() } }));
vi.mock("@/components/common", () => ({ SafeImg: () => null }));

import { BeatIdentity } from "./BeatIdentity";

const render = (phone?: string) =>
  renderToStaticMarkup(createElement(BeatIdentity, { name: "Asha Rao", phone, onDone: () => {} }));

describe("BeatIdentity", () => {
  it("doesn't ask again for a number the person already gave — it shows it with a way to change it", () => {
    const html = render("+919876543210");
    expect(html).toContain("+91 98765 43210");
    expect(html).toContain("ob_phone_change");
    expect(html).not.toContain('id="onboard-phone"');
  });

  it("asks for the number when there isn't a usable one on the profile", () => {
    for (const phone of [undefined, "", "12345"]) {
      const html = render(phone);
      expect(html).toContain('id="onboard-phone"');
      expect(html).not.toContain("ob_phone_change");
    }
  });

  it("no longer shows the read-only Google email field", () => {
    expect(render("+919876543210")).not.toContain("onboard-email");
  });

  it("keeps the 18+ confirmation, unchecked until the person ticks it", () => {
    const html = render("+919876543210");
    expect(html).toContain('id="onboard-adult"');
    expect(html).not.toMatch(/id="onboard-adult"[^>]*checked/);
  });

  it("leads with the name field and the line saying it stays private", () => {
    const html = render("+919876543210");
    expect(html).toContain('id="onboard-name"');
    expect(html).toContain("ob_identity_sub");
  });
});
