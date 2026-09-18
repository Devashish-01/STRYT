// STRYT — classify-report edge function
//
// Triage for user reports against community posts and comments. One TypeSafe request asks Jev several narrow
// questions about the reported content at once; explicit code below turns the typed answers into a priority for
// the moderation queue. Advisory only: it never hides, deletes or dismisses anything — a moderator decides.
//
//   POST { reportId }  with an admin's bearer token  ->  { ok: true, triage }
//
// Secrets:
//   TYPESAFE_API_KEY  required. Without it the function answers 503 and sends nothing anywhere.
//   TYPESAFE_MODEL    optional. Defaults to the Jev version the thresholds in POLICY were written against.
// Auto-injected:
//   SUPABASE_URL, SUPABASE_SECRET_KEYS
//
// Privacy: the reported text leaves our servers for TypeSafe (a processor). Phone numbers, emails, ID numbers
// and UPI handles are masked first, and nothing identifying the reporter or the author is sent. Name TypeSafe in
// the privacy policy before enabling this in production.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// >>> report-classifier
// The classification node. Pure: no Deno, no Supabase — `fetch` is passed in — so tests/report-classifier.test.ts
// and scripts/eval-report-classifier.mjs run exactly this code.

/** What the node classifies: user-written community content. Other report targets need different questions. */
const CLASSIFIABLE = ["POST", "COMMENT"];

interface ReportInput {
  kind: "POST" | "COMMENT";
  /** The reporter's choice in ReportSheet: SPAM | SCAM | OFFENSIVE | FAKE | WRONG_CATEGORY | OTHER. */
  reason: string;
  /** The reporter's optional note. */
  details: string;
  /** The community post type — for a comment, the type of the post it is on. */
  postType: string | null;
  /** The post title — for a comment, the title of the post it is on. */
  title: string | null;
  /** The reported post's body, or the reported comment. */
  text: string;
}

const REASON_LABELS: Record<string, string> = {
  SPAM: "Spam or misleading",
  SCAM: "Looks like a scam",
  OFFENSIVE: "Offensive content",
  FAKE: "Fake listing",
  WRONG_CATEGORY: "Wrong category",
  OTHER: "Something else",
};

const POST_TYPE_LABELS: Record<string, string> = {
  LOST_FOUND: "Lost and found",
  ALERT: "Safety alert",
  RECOMMENDATION: "Asking for a recommendation",
  GIVEAWAY: "Giveaway",
  POLL: "Poll",
  SHOUTOUT: "Shout-out",
};

/** Jev's accuracy falls as state grows with text unrelated to the decision; a report needs the gist, not a novel. */
const MAX_TEXT = 4000;

/**
 * Masks the personal details a report can contain before the text leaves our servers. The placeholders keep the
 * meaning ("[phone number]"), so the model can still see that a post publishes someone's number. Order matters:
 * email before UPI (an email has a dotted domain), UPI before phone (9876543210@paytm), Aadhaar before phone.
 */
function maskPersonalData(text: string): string {
  return text
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[email address]")
    .replace(/\b[A-Za-z0-9._-]{2,}@(?:ok[a-z]+|paytm|ybl|upi|axl|ibl|apl|sbi|hdfcbank|icici)\b/gi, "[UPI ID]")
    .replace(/(?<![\d])\d{4}[\s-]?\d{4}[\s-]?\d{4}(?![\d])/g, "[ID number]")
    .replace(/(?<![\d])(?:\+?91[\s-]?|0)?[6-9]\d{4}[\s-]?\d{5}(?![\d])/g, "[phone number]")
    .replace(/(?<![\d])\+\d{1,3}[\s-]?\d{2,4}[\s-]?\d{3,4}[\s-]?\d{3,4}(?![\d])/g, "[phone number]")
    .replace(/\b[A-Z]{5}\d{4}[A-Z]\b/g, "[ID number]");
}

function clip(text: string | null | undefined): string {
  return maskPersonalData((text ?? "").trim()).slice(0, MAX_TEXT);
}

const CATEGORIES = [
  "none", "spam", "scam", "harassment", "sexual", "dangerous", "private_info", "false_info", "wrong_place",
] as const;
type Category = (typeof CATEGORIES)[number];

/** The flags that each make a report urgent on their own — an "any serious violation" rule, not a weighted sum. */
const FLAGS = ["threat", "self_harm", "money_or_credentials", "exposes_someone"] as const;
type Flag = (typeof FLAGS)[number];

/**
 * One request, asked in parallel over the same state. The ids are for this code only and are never sent to the
 * model, so every instruction carries its full meaning. They judge the content itself; the reporter's view is in
 * the state for context, and only `report_supported` compares the two.
 */
const QUESTIONS = {
  category: {
    type: "choice",
    instructions:
      "Which description best fits what is wrong with `reported_content`? Judge the content itself; `report` says what the reporter thought, but reporters are sometimes mistaken.",
    criteria: {
      none: "Nothing is wrong: an ordinary, harmless post or comment for a neighbourhood community, even if the reporter disliked it or disagreed with it.",
      spam: "Unwanted promotion: advertising, repeated or copy-pasted posts, or links that have nothing to do with the community.",
      scam: "Tries to trick people out of money or personal details: advance payments or fees, fake prizes, giveaways or jobs, requests for an OTP or bank or UPI details, or offers too good to be true.",
      harassment: "Attacks or demeans a person or group: insults, bullying, accusations aimed at a named person, threats, or hate based on religion, caste, gender, ethnicity or similar.",
      sexual: "Sexual or sexually explicit content, or offers of sexual services.",
      dangerous: "Promotes or arranges violence, weapons, drugs or other illegal goods, or encourages self-harm.",
      private_info: "Publishes personal details about someone other than the author, such as their phone number, home address or ID number, without their agreement.",
      false_info: "A false or misleading claim that could alarm or mislead neighbours, such as an unverified safety scare presented as fact.",
      wrong_place: "Legitimate content posted in the wrong place, such as the wrong post type, or a request for a paid service posted as a community post.",
    },
  },
  severity: {
    type: "score",
    instructions: "If `reported_content` stays visible, how much harm could it do to the people who read it or act on it?",
    criteria: [
      "No harm: ordinary community content, including people sharing their own phone number or address so others can reach them.",
      "Nuisance: off-topic, repetitive, low-quality or mildly rude, but nobody is likely to be hurt or lose anything.",
      "Harmful: insults or demeans someone, spreads a misleading claim, or pushes people toward a bad deal.",
      "Serious: could lead to someone losing money, being threatened or physically endangered, or having another person's private details exposed against their will.",
    ],
  },
  threat: {
    type: "noul",
    instructions: "Does `reported_content` threaten, or call for, violence against a person or a group?",
  },
  self_harm: {
    type: "noul",
    instructions: "Does `reported_content` suggest that its author, or someone they mention, intends to harm or kill themselves?",
  },
  money_or_credentials: {
    type: "noul",
    instructions:
      "Does `reported_content` ask readers to pay a fee or send money in advance, or to share an OTP, password, card, bank or UPI details?",
    criteria: {
      true: "It asks for an advance payment, a fee, a transfer, or any of those details.",
      false: "It asks for none of these. Mentioning a price, or offering to pay for a service, does not count.",
    },
  },
  exposes_someone: {
    type: "noul",
    instructions:
      "Does `reported_content` publish a phone number, home address or ID number that belongs to someone other than its author? Personal details in the text are masked, for example [phone number]; judge whose they are from the context.",
    criteria: {
      true: "It publishes another person's details, for example to shame, expose or target them.",
      false: "It publishes no one's details, or only the author's own so people can contact them.",
    },
  },
  report_supported: {
    type: "noul",
    instructions: "Does `reported_content` actually show the problem described in `report`?",
    criteria: {
      true: "The content itself shows the problem the reporter chose or described.",
      false: "The content does not show that problem; the report looks mistaken, or like a disagreement.",
    },
  },
};

/** Pinned: the thresholds in POLICY are written against one model version. Re-check them before moving it. */
const DEFAULT_MODEL = "jev-1.13.0";

function buildRequest(input: ReportInput, model: string = DEFAULT_MODEL) {
  const postType = input.postType ? (POST_TYPE_LABELS[input.postType] ?? input.postType) : null;
  const reported_content = input.kind === "POST"
    ? { kind: "community post", post_type: postType, title: clip(input.title), text: clip(input.text) }
    : { kind: "comment on a community post", text: clip(input.text), on_post: { post_type: postType, title: clip(input.title) } };
  return {
    model,
    state: {
      app: "STRYT, a neighbourhood app in India. People post to their local community (lost and found, safety alerts, recommendations, giveaways, polls, shout-outs) and comment on each other's posts.",
      reported_content,
      report: {
        reason: REASON_LABELS[input.reason] ?? REASON_LABELS.OTHER,
        reporter_note: clip(input.details) || "(no note)",
      },
    },
    questions: QUESTIONS,
  };
}

/**
 * The decision rules, kept in code so they can be read and tuned without rerunning inference.
 *
 * Starting points only: flag 0.70 to act and 0.35 to review, and severity 2 as serious, come from TypeSafe's
 * guardrails cookbook — not from STRYT data, which had two reports in total on 18 Sept 2026. Re-set them with
 * scripts/eval-report-classifier.mjs once moderators have labelled real reports.
 */
const POLICY = {
  /** Any flag at or above this makes a report urgent. */
  urgentFlag: 0.7,
  /** Any flag at or above this makes it at least high, and lists the flag for the moderator. */
  reviewFlag: 0.35,
  /** Severity (0–3) at or above this is urgent… */
  urgentSeverity: 2.5,
  /** …and at or above this, high. */
  highSeverity: 1.5,
  /** Low priority needs all of: severity below this, */
  lowSeverity: 0.5,
  /** the category "none" with at least this confidence, */
  lowNoneConfidence: 0.7,
  /** and report_supported below this. */
  lowSupported: 0.3,
  /** A category below this confidence is shown as "uncertain" rather than as a label. */
  categoryConfidence: 0.6,
  /** When uncertain, categories at or above this probability are offered to the moderator instead. */
  alternativeProbability: 0.2,
};

type Priority = "urgent" | "high" | "normal" | "low";

interface Judgments {
  category: { choice: Category; confidence: number; probabilities: Record<string, number> };
  severity: { score: number; confidence: number; probabilities: Record<string, number> };
  flags: Record<Flag, number>;
  reportSupported: number;
}

interface ReportTriage {
  priority: Priority;
  /** The suggested category, or "uncertain" when the model's answer is spread across several. */
  category: Category | "uncertain";
  categoryConfidence: number;
  /** When uncertain: the leading candidates, most likely first — often two right answers, like harassment and a threat. */
  alternatives: Category[];
  /** 0 no harm … 3 serious, as the probability-weighted mean over the four levels. */
  severity: number;
  /** Flags at or above POLICY.reviewFlag, strongest first. */
  flags: Flag[];
  /** Possible self-harm: the moderator should reach out, not only remove the post. */
  support: boolean;
  /** Probability the content shows what the reporter described. */
  reportSupported: number;
  /** Why this priority, in words a moderator can check. */
  reasons: string[];
  model: string;
  judgments: Judgments;
  /** Tokens billed for this request, as TypeSafe reported them — for watching cost. */
  usage?: { input_tokens: number; output_tokens: number };
}

function num(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

/** Validates the answers against the questions asked. Anything missing or malformed is an error, never a default. */
function readAnswers(response: unknown): Judgments {
  const answers = (response as { answers?: Record<string, Record<string, unknown>> } | null)?.answers;
  if (!answers || typeof answers !== "object") throw new Error("TypeSafe response has no answers");
  const get = (id: string, type: string) => {
    const a = answers[id];
    if (!a || a.type !== type) throw new Error(`TypeSafe answer "${id}" is missing or not a ${type}`);
    return a;
  };

  const c = get("category", "choice");
  if (!CATEGORIES.includes(c.choice as Category) || !num(c.confidence) || typeof c.probabilities !== "object") {
    throw new Error(`TypeSafe answer "category" is malformed`);
  }
  const s = get("severity", "score");
  if (!num(s.score) || s.score > 3 || !num(s.confidence) || typeof s.probabilities !== "object") {
    throw new Error(`TypeSafe answer "severity" is malformed`);
  }
  const noul = (id: string) => {
    const v = get(id, "noul").noul;
    if (!num(v) || v > 1) throw new Error(`TypeSafe answer "${id}" is malformed`);
    return v;
  };

  const flags = {} as Record<Flag, number>;
  for (const f of FLAGS) flags[f] = noul(f);
  return {
    category: {
      choice: c.choice as Category,
      confidence: c.confidence as number,
      probabilities: c.probabilities as Record<string, number>,
    },
    severity: {
      score: s.score as number,
      confidence: s.confidence as number,
      probabilities: s.probabilities as Record<string, number>,
    },
    flags,
    reportSupported: noul("report_supported"),
  };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function decide(j: Judgments, model: string, policy = POLICY): ReportTriage {
  const reasons: string[] = [];
  const flagged = FLAGS
    .filter((f) => j.flags[f] >= policy.reviewFlag)
    .sort((a, b) => j.flags[b] - j.flags[a]);
  const strong = flagged.filter((f) => j.flags[f] >= policy.urgentFlag);
  const sev = j.severity.score;

  let priority: Priority;
  if (strong.length > 0 || sev >= policy.urgentSeverity) {
    priority = "urgent";
    for (const f of strong) reasons.push(`${f} ${r2(j.flags[f])} ≥ ${policy.urgentFlag}`);
    if (sev >= policy.urgentSeverity) reasons.push(`severity ${r2(sev)} ≥ ${policy.urgentSeverity}`);
  } else if (flagged.length > 0 || sev >= policy.highSeverity) {
    priority = "high";
    for (const f of flagged) reasons.push(`${f} ${r2(j.flags[f])} ≥ ${policy.reviewFlag}`);
    if (sev >= policy.highSeverity) reasons.push(`severity ${r2(sev)} ≥ ${policy.highSeverity}`);
  } else if (
    sev < policy.lowSeverity &&
    j.category.choice === "none" &&
    j.category.confidence >= policy.lowNoneConfidence &&
    j.reportSupported < policy.lowSupported
  ) {
    priority = "low";
    reasons.push(
      `looks harmless: severity ${r2(sev)}, "none" at confidence ${r2(j.category.confidence)}, report supported ${r2(j.reportSupported)}`,
    );
  } else {
    priority = "normal";
    reasons.push(`no flag reached ${policy.reviewFlag}; severity ${r2(sev)}`);
  }

  const confident = j.category.confidence >= policy.categoryConfidence;
  const alternatives = confident ? [] : CATEGORIES
    .filter((c) => (j.category.probabilities[c] ?? 0) >= policy.alternativeProbability)
    .sort((a, b) => (j.category.probabilities[b] ?? 0) - (j.category.probabilities[a] ?? 0));
  return {
    priority,
    category: confident ? j.category.choice : "uncertain",
    categoryConfidence: r2(j.category.confidence),
    alternatives,
    severity: r2(sev),
    flags: flagged,
    support: j.flags.self_harm >= policy.reviewFlag,
    reportSupported: r2(j.reportSupported),
    reasons,
    model,
    judgments: j,
  };
}

interface CallOptions {
  apiKey: string;
  fetch: typeof fetch;
  /** Retries after the first attempt, for 429 / 529 / 5xx / network errors. */
  retries?: number;
  baseDelayMs?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

/** POST /v1/systemone, with exponential backoff on 429 and 529 as the API reference asks. */
async function callTypeSafe(body: unknown, opts: CallOptions): Promise<unknown> {
  const retries = opts.retries ?? 2;
  const baseDelay = opts.baseDelayMs ?? 400;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let lastError = "";
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(baseDelay * 2 ** (attempt - 1));
    let res: Response;
    try {
      res = await opts.fetch("https://api.typesafe.ai/v1/systemone", {
        method: "POST",
        headers: { "Authorization": `Bearer ${opts.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
      });
    } catch (e) {
      lastError = `network: ${e instanceof Error ? e.message : String(e)}`;
      continue;
    }
    if (res.ok) return await res.json();
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    lastError = `HTTP ${res.status}${detail ? `: ${detail}` : ""}`;
    const retryable = res.status === 429 || res.status === 529 || res.status >= 500;
    if (!retryable) break;
  }
  throw new Error(`TypeSafe request failed (${lastError})`);
}

/** The node: report in, triage out. Throws rather than guessing — an unclassified report keeps its normal place. */
async function classifyReport(
  input: ReportInput,
  opts: CallOptions & { model?: string },
): Promise<ReportTriage> {
  const request = buildRequest(input, opts.model ?? DEFAULT_MODEL);
  const response = await callTypeSafe(request, opts);
  const triage = decide(readAnswers(response), request.model);
  const usage = (response as { usage?: ReportTriage["usage"] }).usage;
  return usage ? { ...triage, usage } : triage;
}
// <<< report-classifier

/**
 * The project's secret API key, for the RLS-bypassing admin client. Reads the `SUPABASE_SECRET_KEYS` map the
 * platform injects (our key is named "default"), falling back to the legacy service-role variable — same as the
 * other functions; inlined so this one deploys standalone via the dashboard.
 */
function secretKey(): string {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    if (keys?.default) return keys.default as string;
  } catch { /* malformed or absent -- fall through to the legacy key */ }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

// CORS allowlist — reflects only known app origins, never "*" (Security Audit M-3).
const ALLOWED_ORIGINS = new Set([
  "https://stryt.in",
  "https://www.stryt.in",
  "https://localhost", // Capacitor Android/iOS WebView (androidScheme: 'https')
  "http://localhost:5173", // Vite dev
  "http://localhost:4173", // Vite preview
]);

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://stryt.in",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Vary": "Origin",
  };
}

serve(async (req) => {
  const CORS = corsHeaders(req);
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: CORS });
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reply({ ok: false, message: "Method not allowed" }, 405);

  try {
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (!token) return reply({ ok: false, message: "Missing authorization header" }, 401);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, secretKey());
    const { data: { user }, error: authError } = await sb.auth.getUser(token);
    if (authError || !user) return reply({ ok: false, message: "Invalid or expired token" }, 401);

    // Same admin gate as verification-review and admin-delete-profile.
    const { data: me } = await sb.from("users").select("roles").eq("id", user.id).maybeSingle();
    const roles: string[] = me?.roles ?? [];
    if (!roles.includes("admin") && !roles.includes("super_admin")) {
      return reply({ ok: false, message: "Forbidden: Admin privileges required" }, 403);
    }

    const apiKey = Deno.env.get("TYPESAFE_API_KEY") ?? "";
    if (!apiKey) return reply({ ok: false, message: "Report classification is not configured (TYPESAFE_API_KEY)" }, 503);

    const { reportId } = await req.json().catch(() => ({}));
    if (typeof reportId !== "string" || reportId.length === 0 || reportId.length > 100) {
      return reply({ ok: false, message: "reportId is required" }, 400);
    }

    const { data: report, error: reportError } = await sb
      .from("reports")
      .select("id, target_type, target_id, reason, details")
      .eq("id", reportId)
      .maybeSingle();
    if (reportError) throw reportError;
    if (!report) return reply({ ok: false, message: "Report not found" }, 404);
    if (!CLASSIFIABLE.includes(report.target_type)) {
      return reply({ ok: false, message: `Only reports on community posts and comments are classified, not ${report.target_type}` }, 422);
    }

    let input: ReportInput;
    if (report.target_type === "POST") {
      const { data: post, error } = await sb
        .from("community_posts").select("title, body, type").eq("id", report.target_id).maybeSingle();
      if (error) throw error;
      if (!post) return reply({ ok: false, message: "The reported post no longer exists" }, 404);
      input = { kind: "POST", reason: report.reason, details: report.details ?? "", postType: post.type, title: post.title, text: post.body ?? "" };
    } else {
      const { data: comment, error } = await sb
        .from("post_comments").select("body, post_id").eq("id", report.target_id).maybeSingle();
      if (error) throw error;
      if (!comment) return reply({ ok: false, message: "The reported comment no longer exists" }, 404);
      const { data: post } = await sb
        .from("community_posts").select("title, type").eq("id", comment.post_id).maybeSingle();
      input = { kind: "COMMENT", reason: report.reason, details: report.details ?? "", postType: post?.type ?? null, title: post?.title ?? null, text: comment.body };
    }

    const triage = await classifyReport(input, {
      apiKey,
      fetch,
      model: Deno.env.get("TYPESAFE_MODEL") || undefined,
    });
    return reply({ ok: true, reportId, triage });
  } catch (e) {
    console.error("classify-report failed:", e instanceof Error ? e.message : e);
    return reply({ ok: false, message: e instanceof Error ? e.message : "Classification failed" }, 502);
  }
});
