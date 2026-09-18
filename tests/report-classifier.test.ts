import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";

/**
 * Tests the report-classification node exactly as it ships, by reading the marked block out of the edge function
 * (edge functions inline their code so each deploys standalone) and running it against a fake TypeSafe API.
 *
 * What these can prove: the request is well-formed and private, the answers are validated, the policy maps
 * judgments to priorities as documented, and failures are loud. What they cannot prove is that Jev's judgments
 * are right for STRYT's reports — that is scripts/eval-moderation.mjs, against the live API.
 */

const FILE = "supabase/functions/moderation/index.ts";
const START = "// >>> report-classifier";
const END = "// <<< report-classifier";

function block(): string {
  const src = readFileSync(FILE, "utf8").replace(/\r\n/g, "\n");
  const a = src.indexOf(START);
  const b = src.indexOf(END);
  if (a < 0 || b < 0) throw new Error("report-classifier markers missing");
  return src.slice(a, b + END.length);
}

type Node = {
  maskPersonalData: (t: string) => string;
  buildRequest: (input: Input, model?: string) => { model: string; state: any; questions: Record<string, any> };
  readAnswers: (r: unknown) => any;
  decide: (j: any, model: string) => Triage;
  callTypeSafe: (body: unknown, opts: any) => Promise<unknown>;
  classifyReport: (input: Input, opts: any) => Promise<Triage>;
  POLICY: Record<string, number>;
  DEFAULT_MODEL: string;
  buildContentRequest: (input: ContentIn, model?: string) => { model: string; state: any; questions: Record<string, any> };
  readTyped: (r: unknown, nouls: readonly string[], categories: readonly string[]) => any;
  decideContent: (a: any, model: string) => Verdict;
  classifyContent: (input: ContentIn, opts: any) => Promise<Verdict>;
  verdictSummary: (v: Verdict) => string;
  CONTENT_NOULS: readonly string[];
};
type ContentIn = { kind: "POST" | "COMMENT"; postType: string | null; title: string | null; text: string };
type Verdict = {
  action: "hide" | "review" | "pass"; support: boolean; category: string; categoryConfidence: number;
  severity: number; flags: string[]; reasons: string[]; model: string; usage?: unknown;
};
type Input = { kind: "POST" | "COMMENT"; reason: string; details: string; postType: string | null; title: string | null; text: string };
type Triage = {
  priority: string; category: string; categoryConfidence: number; severity: number; flags: string[];
  support: boolean; reportSupported: number; reasons: string[]; model: string;
};

const node: Node = new Function(
  `${transformSync(block(), { loader: "ts" }).code}
  return { maskPersonalData, buildRequest, readAnswers, decide, callTypeSafe, classifyReport, POLICY, DEFAULT_MODEL,
    buildContentRequest, readTyped, decideContent, classifyContent, verdictSummary, CONTENT_NOULS };`,
)();

const post = (text: string, extra: Partial<Input> = {}): Input => ({
  kind: "POST", reason: "SCAM", details: "", postType: "GIVEAWAY", title: "Free phone", text, ...extra,
});

/** A well-formed TypeSafe response; override any answer. */
function response(over: Record<string, unknown> = {}) {
  return {
    model: "jev-1.13.0",
    answers: {
      category: { type: "choice", choice: "none", confidence: 0.9, probabilities: { none: 0.95 } },
      severity: { type: "score", score: 0.1, confidence: 0.9, probabilities: { "0": 0.9, "1": 0.1 }, legend: {} },
      threat: { type: "noul", noul: 0.02 },
      self_harm: { type: "noul", noul: 0.01 },
      money_or_credentials: { type: "noul", noul: 0.03 },
      exposes_someone: { type: "noul", noul: 0.02 },
      report_supported: { type: "noul", noul: 0.1 },
      ...over,
    },
    usage: { input_tokens: 900, output_tokens: 7 },
  };
}

const triage = (over: Record<string, unknown> = {}) => node.decide(node.readAnswers(response(over)), "jev-1.13.0");
const noul = (v: number) => ({ type: "noul", noul: v });
const severity = (score: number) => ({ type: "score", score, confidence: 0.8, probabilities: {}, legend: {} });
const category = (choice: string, confidence: number) => ({ type: "choice", choice, confidence, probabilities: {} });

describe("personal details are masked before anything leaves our servers", () => {
  it.each([
    ["+91 98765 43210", "[phone number]"],
    ["098765 43210", "[phone number]"],
    ["98765-43210", "[phone number]"],
    ["9876543210", "[phone number]"],
    ["+44 20 7946 0958", "[phone number]"],
    ["asha.k@gmail.com", "[email address]"],
    ["lucky@ybl", "[UPI ID]"],
    ["9876543210@paytm", "[UPI ID]"],
    ["1234 5678 9012", "[ID number]"],
    ["ABCDE1234F", "[ID number]"],
  ])("%s", (raw, placeholder) => {
    const out = node.maskPersonalData(`call ${raw} today`);
    expect(out).toBe(`call ${placeholder} today`);
  });

  it("keeps prices, dates, times and flat numbers, which carry the meaning of a post", () => {
    const text = "Pay ₹499 by 12/10/2026 at 7:30 pm, flat 402, 3 BHK, 25 lakh";
    expect(node.maskPersonalData(text)).toBe(text);
  });

  it("masks every field sent: title, text and the reporter's note", () => {
    const req = node.buildRequest(post("pay to 9876543210@paytm", {
      title: "call 98765 43210", details: "he emailed me from x@y.com",
    }));
    const sent = JSON.stringify(req);
    expect(sent).not.toMatch(/98765|9876543210|x@y\.com|paytm/);
  });

  it("sends no field that identifies the reporter or the author", () => {
    // The state is the only per-report data sent; the questions are fixed text.
    const state = JSON.stringify(node.buildRequest(post("hello")).state);
    expect(state).not.toMatch(/user_id|author|reporter_user|avatar|"name"/i);
  });
});

describe("the request", () => {
  const req = node.buildRequest(post("Free iPhone, pay ₹499 delivery"));

  it("asks every question in one request, as the API expects", () => {
    expect(Object.keys(req.questions).sort()).toEqual(
      ["category", "exposes_someone", "money_or_credentials", "report_supported", "self_harm", "severity", "threat"],
    );
    for (const q of Object.values(req.questions)) {
      expect(["choice", "noul", "score"]).toContain(q.type);
      expect(q.instructions.length).toBeGreaterThan(20);
    }
  });

  it("offers a no-match answer, so harmless content is not forced into a violation", () => {
    expect(req.questions.category.criteria).toHaveProperty("none");
  });

  it("gives Score 2–10 ordered levels", () => {
    expect(req.questions.severity.criteria.length).toBeGreaterThanOrEqual(2);
    expect(req.questions.severity.criteria.length).toBeLessThanOrEqual(10);
  });

  it("only points questions at state that exists", () => {
    for (const q of Object.values(req.questions)) {
      for (const [, path] of q.instructions.matchAll(/`([a-z_.]+)`/g)) {
        const value = path.split(".").reduce((o: any, k: string) => o?.[k], req.state);
        expect(value, `${path} in: ${q.instructions}`).toBeDefined();
      }
    }
  });

  it("pins the model the thresholds were written against", () => {
    expect(req.model).toBe(node.DEFAULT_MODEL);
    expect(node.DEFAULT_MODEL).toMatch(/^jev-\d+\.\d+\.\d+$/);
  });

  it("describes a comment together with the post it is on", () => {
    const r = node.buildRequest({ kind: "COMMENT", reason: "OFFENSIVE", details: "", postType: "LOST_FOUND", title: "Lost wallet", text: "found it" });
    expect(r.state.reported_content).toEqual({
      kind: "comment on a community post", text: "found it", on_post: { post_type: "Lost and found", title: "Lost wallet" },
    });
  });

  it("uses the words the reporter saw, not internal codes", () => {
    expect(req.state.report.reason).toBe("Looks like a scam");
    expect(req.state.report.reporter_note).toBe("(no note)");
  });

  it("bounds the text it sends", () => {
    const r = node.buildRequest(post("x".repeat(20_000)));
    expect(r.state.reported_content.text.length).toBe(4000);
  });
});

describe("the policy: judgments to priority", () => {
  it("harmless content, confidently, against an unsupported report: low", () => {
    const t = triage();
    expect(t.priority).toBe("low");
    expect(t.category).toBe("none");
    expect(t.flags).toEqual([]);
  });

  it.each(["threat", "self_harm", "money_or_credentials", "exposes_someone"])(
    "any single flag at 0.70 is urgent on its own: %s",
    (flag) => {
      const t = triage({ [flag]: noul(0.7) });
      expect(t.priority).toBe("urgent");
      expect(t.flags).toEqual([flag]);
    },
  );

  it("a flag at the review threshold is high, not urgent", () => {
    expect(triage({ threat: noul(0.35) }).priority).toBe("high");
    expect(triage({ threat: noul(0.34) }).priority).not.toBe("high");
  });

  it("severity alone: 2.5 is urgent, 1.5 is high", () => {
    expect(triage({ severity: severity(2.5) }).priority).toBe("urgent");
    expect(triage({ severity: severity(1.5) }).priority).toBe("high");
  });

  it("is never low when the model is unsure the content is harmless", () => {
    expect(triage({ category: category("none", 0.5) }).priority).toBe("normal");
  });

  it("is never low when the content does show what the reporter said", () => {
    expect(triage({ report_supported: noul(0.6) }).priority).toBe("normal");
  });

  it("is never low for a nuisance, even a confident one", () => {
    expect(triage({ severity: severity(0.9) }).priority).toBe("normal");
  });

  it("shows an unconfident category as uncertain rather than as a label", () => {
    const t = triage({ category: category("scam", 0.4) });
    expect(t.category).toBe("uncertain");
    expect(t.categoryConfidence).toBe(0.4);
  });

  it("offers the leading candidates when uncertain, most likely first", () => {
    // Seen live: a threat split 0.53 / 0.47 between two right answers.
    const split = { type: "choice", choice: "dangerous", confidence: 0.47,
      probabilities: { dangerous: 0.53, harassment: 0.46, none: 0.01 } };
    expect(triage({ category: split }).alternatives).toEqual(["dangerous", "harassment"]);
  });

  it("offers no alternatives when the category is confident", () => {
    expect(triage().alternatives).toEqual([]);
  });

  it("asks the moderator to reach out for possible self-harm, at the review threshold", () => {
    expect(triage({ self_harm: noul(0.4) }).support).toBe(true);
    expect(triage({ self_harm: noul(0.2) }).support).toBe(false);
  });

  it("lists flags strongest first and says why", () => {
    const t = triage({ threat: noul(0.5), money_or_credentials: noul(0.9) });
    expect(t.flags).toEqual(["money_or_credentials", "threat"]);
    expect(t.reasons).toEqual(["money_or_credentials 0.9 ≥ 0.7"]);
  });
});

describe("answers are validated, never defaulted", () => {
  it.each([
    ["no answers", {}],
    ["a missing question", { answers: { ...response().answers, threat: undefined } }],
    ["the wrong type", { answers: { ...response().answers, threat: { type: "choice", choice: "yes" } } }],
    ["an unknown category", response({ category: category("rude", 0.9) })],
    ["a probability above 1", response({ threat: noul(1.2) })],
    ["a severity above the top level", response({ severity: severity(3.4) })],
    ["a non-number", response({ self_harm: { type: "noul", noul: "0.2" } })],
  ])("rejects %s", (_label, bad) => {
    expect(() => node.readAnswers(bad)).toThrow(/TypeSafe/);
  });
});

describe("calling the API", () => {
  const ok = () => new Response(JSON.stringify(response()), { status: 200 });
  const status = (s: number) => new Response("nope", { status: s });
  const opts = (fetch: unknown) => ({ apiKey: "k-123", fetch, sleep: vi.fn().mockResolvedValue(undefined) });

  it("posts to the evaluation endpoint with a bearer key", async () => {
    const fetch = vi.fn().mockResolvedValue(ok());
    await node.callTypeSafe({ a: 1 }, opts(fetch));
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://api.typesafe.ai/v1/systemone");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer k-123");
    expect(JSON.parse(init.body)).toEqual({ a: 1 });
  });

  it.each([429, 529, 503])("backs off and retries on %s", async (s) => {
    const fetch = vi.fn().mockResolvedValueOnce(status(s)).mockResolvedValueOnce(ok());
    const o = opts(fetch);
    await expect(node.callTypeSafe({}, o)).resolves.toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(o.sleep).toHaveBeenCalledWith(400);
  });

  it("retries a network error", async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new Error("reset")).mockResolvedValueOnce(ok());
    await expect(node.callTypeSafe({}, opts(fetch))).resolves.toBeTruthy();
  });

  it.each([401, 422])("does not retry %s, which would fail again", async (s) => {
    const fetch = vi.fn().mockResolvedValue(status(s));
    await expect(node.callTypeSafe({}, opts(fetch))).rejects.toThrow(`HTTP ${s}`);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("gives up after the retries, doubling the wait", async () => {
    const fetch = vi.fn().mockResolvedValue(status(529));
    const o = opts(fetch);
    await expect(node.callTypeSafe({}, o)).rejects.toThrow("HTTP 529");
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(o.sleep.mock.calls.map((c: number[]) => c[0])).toEqual([400, 800]);
  });
});

describe("the node end to end, against a fake API", () => {
  it("turns a report into a triage", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(response({
      category: category("scam", 0.92),
      severity: severity(2.7),
      money_or_credentials: noul(0.95),
      report_supported: noul(0.97),
    }))));
    const t = await node.classifyReport(post("Pay ₹499 to lucky@ybl and share the OTP"), { apiKey: "k", fetch });
    expect(t).toMatchObject({
      priority: "urgent", category: "scam", flags: ["money_or_credentials"], support: false, model: "jev-1.13.0",
    });
    const sent = JSON.parse(fetch.mock.calls[0][1].body);
    expect(sent.state.reported_content.text).toBe("Pay ₹499 to [UPI ID] and share the OTP");
    expect((t as any).usage).toEqual({ input_tokens: 900, output_tokens: 7 });
  });

  it("fails loudly on a malformed response instead of guessing a priority", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ answers: {} })));
    await expect(node.classifyReport(post("x"), { apiKey: "k", fetch })).rejects.toThrow(/TypeSafe/);
  });
});

// ── The automatic check (every new or edited post and comment) ────────────────────────────────────────────────

const contentPost = (text: string): ContentIn => ({ kind: "POST", postType: "SHOUTOUT", title: "Hello", text });

/** A well-formed automatic-check response; override any answer. */
function contentResponse(over: Record<string, unknown> = {}) {
  const base = response().answers as Record<string, unknown>;
  delete base.report_supported;
  return {
    model: "jev-1.13.0",
    answers: { ...base, abusive_language: { type: "noul", noul: 0.02 }, ...over },
    usage: { input_tokens: 800, output_tokens: 7 },
  };
}
const verdict = (over: Record<string, unknown> = {}) =>
  node.decideContent(
    node.readTyped(contentResponse(over), node.CONTENT_NOULS, Object.keys(node.buildContentRequest(contentPost("x")).questions.category.criteria)),
    "jev-1.13.0",
  );

describe("the automatic check's request", () => {
  const req = node.buildContentRequest(contentPost("Lost cat, call 98765 43210"));

  it("asks about `content`, never about a report", () => {
    const text = JSON.stringify(req.questions);
    expect(text).not.toMatch(/reported_content|`report`/);
    expect(req.state).not.toHaveProperty("report");
  });

  it("only points questions at state that exists", () => {
    for (const q of Object.values(req.questions)) {
      for (const [, path] of q.instructions.matchAll(/`([a-z_.]+)`/g)) {
        const value = path.split(".").reduce((o: any, k: string) => o?.[k], req.state);
        expect(value, `${path} in: ${q.instructions}`).toBeDefined();
      }
    }
  });

  it("adds graphic content and abusive language, which the report questions do not ask", () => {
    expect(req.questions.category.criteria).toHaveProperty("graphic");
    expect(req.questions).toHaveProperty("abusive_language");
    const report = node.buildRequest(post("x"));
    expect(report.questions.category.criteria).not.toHaveProperty("graphic");
    expect(report.questions).not.toHaveProperty("abusive_language");
  });

  it("keeps the report questions word for word, since those were evaluated", () => {
    const report = node.buildRequest(post("x"));
    for (const id of ["severity", "threat", "self_harm", "money_or_credentials", "exposes_someone"]) {
      expect(req.questions[id].instructions).toBe(report.questions[id].instructions.split("`reported_content`").join("`content`"));
    }
  });

  it("masks personal details here too", () => {
    expect(JSON.stringify(req)).not.toMatch(/98765/);
  });

  it("a report answer outside the report's options is rejected", () => {
    const bad = response({ category: category("graphic", 0.9) });
    expect(() => node.readAnswers(bad)).toThrow(/category/);
  });
});

describe("the automatic check's decision", () => {
  it("ordinary content passes", () => {
    expect(verdict().action).toBe("pass");
  });

  it.each(["threat", "money_or_credentials", "exposes_someone"])("hides on %s at 0.70", (flag) => {
    expect(verdict({ [flag]: noul(0.7) }).action).toBe("hide");
    expect(verdict({ [flag]: noul(0.69) }).action).toBe("review");
  });

  it("hides abusive language at 0.80, and only asks a moderator below that", () => {
    expect(verdict({ abusive_language: noul(0.8) }).action).toBe("hide");
    expect(verdict({ abusive_language: noul(0.6) }).action).toBe("review");
  });

  it("hides a confident, serious violation of a hiding category", () => {
    const v = verdict({ category: category("harassment", 0.9), severity: severity(2.2) });
    expect(v.action).toBe("hide");
  });

  it("does not hide on a category that is unsure or mild", () => {
    expect(verdict({ category: category("harassment", 0.7), severity: severity(2.2) }).action).toBe("review");
    expect(verdict({ category: category("harassment", 0.9), severity: severity(1.2) }).action).toBe("review");
  });

  it("a confident label, however mild, reaches a moderator; an unsure one or a filing problem does not", () => {
    expect(verdict({ category: category("harassment", 0.85), severity: severity(0.8) }).action).toBe("review");
    expect(verdict({ category: category("harassment", 0.6), severity: severity(0.8) }).action).toBe("pass");
    expect(verdict({ category: category("wrong_place", 0.95), severity: severity(0.2) }).action).toBe("pass");
  });

  it("never hides spam or misinformation on the category alone — a moderator decides those", () => {
    expect(verdict({ category: category("spam", 0.99), severity: severity(2.4) }).action).toBe("review");
    expect(verdict({ category: category("false_info", 0.99), severity: severity(2.4) }).action).toBe("review");
  });

  it("a cry for help is filed as 'reach out', not hidden, even when labelled dangerous", () => {
    const v = verdict({ self_harm: noul(0.9), category: category("dangerous", 0.96), severity: severity(2.9) });
    expect(v.action).toBe("review");
    expect(v.support).toBe(true);
    expect(node.verdictSummary(v)).toMatch(/reach out/);
  });

  it("but self-harm content that also threatens others is still hidden", () => {
    const v = verdict({ self_harm: noul(0.9), threat: noul(0.9) });
    expect(v.action).toBe("hide");
    expect(v.support).toBe(true);
  });

  it("says why, in the moderator's queue", () => {
    const v = verdict({ money_or_credentials: noul(0.95), category: category("scam", 0.98), severity: severity(3) });
    expect(node.verdictSummary(v)).toBe(
      "Hidden by the automatic check: scam, severity 3/3. money_or_credentials 0.95 ≥ 0.7; scam at confidence 0.98, severity 3.",
    );
  });

  it("end to end against a fake API, with usage reported", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(contentResponse({ abusive_language: noul(0.93) }))));
    const v = await node.classifyContent(contentPost("..."), { apiKey: "k", fetch });
    expect(v.action).toBe("hide");
    expect(v.usage).toEqual({ input_tokens: 800, output_tokens: 7 });
  });
});
