// STRYT — moderation edge function
//
// Two jobs, one TypeSafe (Jev) node. Both ask several narrow questions in one request and let explicit code below
// decide what to do with the typed answers.
//
//   1. The automatic check (from the database). Every new or edited public text is queued here by a trigger
//      (migrations 20260990, 20260991) while moderation_settings.content_check_enabled is on — community posts and
//      comments, reviews, requests, story captions, bulk deals, business listings and provider profiles:
//        POST { action: "check_content", targetType: <CONTENT_KINDS>, targetId }   apikey: <secret key>
//      A clear violation is hidden at once and filed for a moderator; a borderline one is only filed. Businesses
//      and providers are only ever filed, never hidden. Possible self-harm is filed as "reach out" and never
//      hidden on that alone. Proposal messages and chat are not checked: they are private.
//
//   2. Report triage (from an admin). A priority for a user report in the moderation queue:
//        POST { action: "classify_report", reportId }   Authorization: Bearer <admin's token>
//      Advisory only.
//
// Neither removes anything: a moderator removes or restores (admin_moderation_remove / admin_moderation_restore).
//
// Deploy with verify_jwt = false (supabase/config.toml): the trigger sends the secret key, which is not a JWT. Each
// path checks its caller itself — the secret key for the first, an admin's session for the second.
//
// Secrets:
//   TYPESAFE_API_KEY  required. Without it both paths answer 503 and send nothing anywhere.
//   TYPESAFE_MODEL    optional. Defaults to the Jev version the thresholds were written against.
// Auto-injected:
//   SUPABASE_URL, SUPABASE_SECRET_KEYS
//
// Privacy: post and comment text leaves our servers for TypeSafe (a processor). Phone numbers, emails, ID numbers
// and UPI handles are masked first, and nothing identifying the author or a reporter is sent. Name TypeSafe in the
// privacy policy before enabling this in production.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// >>> report-classifier
// The classification node. Pure: no Deno, no Supabase — `fetch` is passed in — so tests/report-classifier.test.ts
// and scripts/eval-moderation.mjs run exactly this code.

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
  // Offered only by the automatic check (CONTENT_QUESTIONS); the report questions do not include it.
  "graphic",
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

// ── The automatic check ──────────────────────────────────────────────────────────────────────────────────────
// Every new or edited post and comment, queued by a database trigger (20260990). The report questions, asked of
// `content` instead of `reported_content`, plus two a report does not need: graphic content, and abusive language —
// which here is often Hindi or Hinglish.

/** What the automatic check reads. */
interface ContentInput {
  kind: ContentKind;
  /** The community post type — for a comment, the type of the post it is on. Only posts and comments have one. */
  postType: string | null;
  /** A title or name: the post's (for a comment, its post's), a request's or deal's title, a business or provider name. */
  title: string | null;
  /** The text itself: the post's body, the comment, the review, the description, the caption or the bio. */
  text: string;
}

/**
 * Every place the automatic check reads (20260990, 20260991). Proposal messages and chat are not here on purpose:
 * they are private between two people.
 */
const CONTENT_KINDS = ["POST", "COMMENT", "RATING", "REQUEST", "STORY", "BULK_DEAL", "BUSINESS", "PROVIDER"] as const;
type ContentKind = (typeof CONTENT_KINDS)[number];

/** Filed for a moderator, never hidden automatically: hiding a whole shop or profile is a moderator's decision. */
const REVIEW_ONLY_KINDS: readonly string[] = ["BUSINESS", "PROVIDER"];

/** How each kind is described to the model. Posts and comments keep the shape that was evaluated. */
const CONTENT_KIND_LABELS: Record<Exclude<ContentKind, "POST" | "COMMENT">, string> = {
  RATING: "review of a local business or service provider",
  REQUEST: "request for a local service, shown to nearby providers",
  STORY: "caption on a short-lived story",
  BULK_DEAL: "group-buy offer from a local business",
  BUSINESS: "a local business's public listing (name and description)",
  PROVIDER: "a service provider's public profile (name and bio)",
};

/** A report question, asked about `content` instead. */
function aboutContent<T extends { instructions: string }>(q: T): T {
  return { ...q, instructions: q.instructions.split("`reported_content`").join("`content`") };
}

const CONTENT_QUESTIONS = {
  category: {
    type: "choice",
    instructions:
      "Which description best fits `content`? Most posts and comments in a neighbourhood app are ordinary; answer none unless something is clearly wrong.",
    criteria: {
      ...QUESTIONS.category.criteria,
      none: "Nothing is wrong: an ordinary post or comment for a neighbourhood community, including complaints, strong opinions and disagreements.",
      graphic: "Describes gore, injury, cruelty or disgusting things in graphic detail, to shock or disgust.",
    },
  },
  severity: aboutContent(QUESTIONS.severity),
  threat: aboutContent(QUESTIONS.threat),
  self_harm: aboutContent(QUESTIONS.self_harm),
  money_or_credentials: aboutContent(QUESTIONS.money_or_credentials),
  exposes_someone: aboutContent(QUESTIONS.exposes_someone),
  abusive_language: {
    type: "noul",
    instructions: "Does `content` use swear words, slurs or vulgar insults, in any language, including Hindi or Hinglish?",
    criteria: {
      true: "It uses abusive, obscene or vulgar words, even as a joke.",
      false: "It uses none. Anger, criticism and complaints in clean words do not count.",
    },
  },
};

/** Pinned: the thresholds in POLICY are written against one model version. Re-check them before moving it. */
const DEFAULT_MODEL = "jev-1.13.0";

/** Context for every question: where this text was written. */
const APP_CONTEXT =
  "STRYT, a neighbourhood app in India. People post to their local community (lost and found, safety alerts, recommendations, giveaways, polls, shout-outs) and comment on each other's posts.";

function buildRequest(input: ReportInput, model: string = DEFAULT_MODEL) {
  const postType = input.postType ? (POST_TYPE_LABELS[input.postType] ?? input.postType) : null;
  const reported_content = input.kind === "POST"
    ? { kind: "community post", post_type: postType, title: clip(input.title), text: clip(input.text) }
    : { kind: "comment on a community post", text: clip(input.text), on_post: { post_type: postType, title: clip(input.title) } };
  return {
    model,
    state: {
      app: APP_CONTEXT,
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
 * scripts/eval-moderation.mjs once moderators have labelled real reports.
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
type TypedAnswers = {
  category: Judgments["category"];
  severity: Judgments["severity"];
  nouls: Record<string, number>;
};

/**
 * Validates the answers against the questions asked. Anything missing or malformed is an error, never a default.
 * `categories` is what the Choice offered, so an answer outside it is rejected too.
 */
function readTyped(response: unknown, nouls: readonly string[], categories: readonly string[]): TypedAnswers {
  const answers = (response as { answers?: Record<string, Record<string, unknown>> } | null)?.answers;
  if (!answers || typeof answers !== "object") throw new Error("TypeSafe response has no answers");
  const get = (id: string, type: string) => {
    const a = answers[id];
    if (!a || a.type !== type) throw new Error(`TypeSafe answer "${id}" is missing or not a ${type}`);
    return a;
  };

  const c = get("category", "choice");
  if (!categories.includes(c.choice as string) || !num(c.confidence) || typeof c.probabilities !== "object") {
    throw new Error(`TypeSafe answer "category" is malformed`);
  }
  const s = get("severity", "score");
  if (!num(s.score) || s.score > 3 || !num(s.confidence) || typeof s.probabilities !== "object") {
    throw new Error(`TypeSafe answer "severity" is malformed`);
  }
  const values: Record<string, number> = {};
  for (const id of nouls) {
    const v = get(id, "noul").noul;
    if (!num(v) || v > 1) throw new Error(`TypeSafe answer "${id}" is malformed`);
    values[id] = v;
  }
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
    nouls: values,
  };
}

/** A report's answers. */
function readAnswers(response: unknown): Judgments {
  const a = readTyped(response, [...FLAGS, "report_supported"], Object.keys(QUESTIONS.category.criteria));
  const flags = {} as Record<Flag, number>;
  for (const f of FLAGS) flags[f] = a.nouls[f];
  return { category: a.category, severity: a.severity, flags, reportSupported: a.nouls.report_supported };
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

function buildContentRequest(input: ContentInput, model: string = DEFAULT_MODEL) {
  const postType = input.postType ? (POST_TYPE_LABELS[input.postType] ?? input.postType) : null;
  let content: Record<string, unknown>;
  if (input.kind === "POST") {
    content = { kind: "community post", post_type: postType, title: clip(input.title), text: clip(input.text) };
  } else if (input.kind === "COMMENT") {
    content = { kind: "comment on a community post", text: clip(input.text), on_post: { post_type: postType, title: clip(input.title) } };
  } else {
    content = { kind: CONTENT_KIND_LABELS[input.kind], ...(input.title ? { title: clip(input.title) } : {}), text: clip(input.text) };
  }
  return { model, state: { app: APP_CONTEXT, content }, questions: CONTENT_QUESTIONS };
}

const CONTENT_NOULS = [...FLAGS, "abusive_language"] as const;

/**
 * What the automatic check does with its answers. Hiding someone's post before a person has looked is a stronger
 * act than ordering a queue, so the bar to hide is higher than the bar to ask a moderator.
 *
 * Starting points, like POLICY — re-set them with scripts/eval-moderation.mjs on labelled posts.
 */
const CONTENT_POLICY = {
  /** threat, money_or_credentials or exposes_someone at or above this: hide. */
  hideFlag: 0.7,
  /** abusive_language at or above this: hide. */
  hideAbusive: 0.8,
  /** One of these categories, this confident, at this severity or more: hide. */
  hideCategories: ["scam", "harassment", "sexual", "dangerous", "private_info", "graphic"] as readonly string[],
  hideCategoryConfidence: 0.8,
  hideSeverity: 2,
  /** Otherwise any flag at or above this, or severity at or above reviewSeverity: a moderator looks, nothing hides. */
  reviewFlag: 0.5,
  reviewSeverity: 1.5,
  /** Or a confident label that something is wrong, however mild: a moderator looks. */
  reviewCategoryConfidence: 0.8,
  /** self_harm at or above this: a moderator reaches out. Never hidden on this alone — neighbours may be the help. */
  support: 0.35,
};

type ContentAction = "hide" | "review" | "pass";

interface ContentVerdict {
  action: ContentAction;
  /** Possible self-harm: reach out. */
  support: boolean;
  category: Category | "uncertain";
  categoryConfidence: number;
  severity: number;
  /** Flags (and abusive_language) at or above CONTENT_POLICY.reviewFlag, strongest first. */
  flags: string[];
  reasons: string[];
  model: string;
  judgments: TypedAnswers;
  usage?: { input_tokens: number; output_tokens: number };
}

function decideContent(a: TypedAnswers, model: string, policy = CONTENT_POLICY): ContentVerdict {
  const reasons: string[] = [];
  const cat = a.category.choice;
  const conf = a.category.confidence;
  const sev = a.severity.score;
  const support = a.nouls.self_harm >= policy.support;

  const strong = FLAGS.filter((f) => f !== "self_harm" && a.nouls[f] >= policy.hideFlag);
  for (const f of strong) reasons.push(`${f} ${r2(a.nouls[f])} ≥ ${policy.hideFlag}`);
  const abusive = a.nouls.abusive_language >= policy.hideAbusive;
  if (abusive) reasons.push(`abusive_language ${r2(a.nouls.abusive_language)} ≥ ${policy.hideAbusive}`);
  // A cry for help is labelled "dangerous" too; it is not hidden on the category alone.
  const categoryHide = !support && policy.hideCategories.includes(cat) &&
    conf >= policy.hideCategoryConfidence && sev >= policy.hideSeverity;
  if (categoryHide) reasons.push(`${cat} at confidence ${r2(conf)}, severity ${r2(sev)}`);

  let action: ContentAction;
  if (strong.length > 0 || abusive || categoryHide) {
    action = "hide";
  } else {
    const soft = CONTENT_NOULS.filter((f) => f !== "self_harm" && a.nouls[f] >= policy.reviewFlag);
    for (const f of soft) reasons.push(`${f} ${r2(a.nouls[f])} ≥ ${policy.reviewFlag}`);
    if (sev >= policy.reviewSeverity) reasons.push(`severity ${r2(sev)} ≥ ${policy.reviewSeverity}`);
    // wrong_place is a filing problem, not a moderation one.
    const labelled = cat !== "none" && cat !== "wrong_place" && conf >= policy.reviewCategoryConfidence;
    if (labelled) reasons.push(`${cat} at confidence ${r2(conf)}`);
    if (support) reasons.push(`self_harm ${r2(a.nouls.self_harm)} ≥ ${policy.support}: reach out`);
    action = soft.length > 0 || sev >= policy.reviewSeverity || labelled || support ? "review" : "pass";
  }

  const flags = CONTENT_NOULS
    .filter((f) => a.nouls[f] >= policy.reviewFlag)
    .sort((x, y) => a.nouls[y] - a.nouls[x]);
  return {
    action,
    support,
    category: conf >= POLICY.categoryConfidence ? cat : "uncertain",
    categoryConfidence: r2(conf),
    severity: r2(sev),
    flags,
    reasons,
    model,
    judgments: a,
  };
}

/** The automatic check: a post or comment in, a verdict out. Throws rather than guessing. */
async function classifyContent(
  input: ContentInput,
  opts: CallOptions & { model?: string },
): Promise<ContentVerdict> {
  const request = buildContentRequest(input, opts.model ?? DEFAULT_MODEL);
  const response = await callTypeSafe(request, opts);
  const categories = Object.keys(CONTENT_QUESTIONS.category.criteria);
  let verdict = decideContent(readTyped(response, CONTENT_NOULS, categories), request.model);
  if (verdict.action === "hide" && REVIEW_ONLY_KINDS.includes(input.kind)) {
    verdict = { ...verdict, action: "review", reasons: [...verdict.reasons, "a listing or profile is never hidden automatically"] };
  }
  const usage = (response as { usage?: ContentVerdict["usage"] }).usage;
  return usage ? { ...verdict, usage } : verdict;
}

/** One line for the moderator's queue, in the words they act on. */
function verdictSummary(v: ContentVerdict): string {
  const what = v.action === "hide" ? "Hidden by the automatic check" : "Flagged by the automatic check";
  const label = v.category === "uncertain" ? "unclear category" : v.category.replace(/_/g, " ");
  const help = v.support ? " Possible self-harm: reach out to the author, do not only remove." : "";
  return `${what}: ${label}, severity ${v.severity}/3. ${v.reasons.join("; ")}.${help}`;
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

/**
 * Whether the caller is our own database trigger. It sends the project's secret key on `apikey` (see 20260883 for
 * why never on Authorization). Same check as send-push; with verify_jwt off, this is the boundary for that path.
 */
function isInternalCall(req: Request): boolean {
  const key = secretKey();
  if (!key) return false;
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer /, "");
  return req.headers.get("apikey") === key || bearer === key;
}

// deno-lint-ignore no-explicit-any
type Admin = any;

/** Tables that can hide a row (20260990, 20260991). Businesses and providers are checked but never hidden here. */
const HIDE_TABLE: Record<string, string> = {
  POST: "community_posts",
  COMMENT: "post_comments",
  RATING: "ratings",
  REQUEST: "requests",
  STORY: "stories",
  BULK_DEAL: "bulk_deals",
};

type Loaded = { input: ContentInput; hidden: string | null; name: string };

/** Reads what the automatic check needs for one item. Null when it no longer exists. */
async function loadContent(sb: Admin, kind: ContentKind, id: string): Promise<Loaded | null> {
  const one = async (table: string, columns: string) => {
    const { data, error } = await sb.from(table).select(columns).eq("id", id).maybeSingle();
    if (error) throw error;
    return data;
  };
  const input = (title: string | null, text: string | null, postType: string | null = null): ContentInput =>
    ({ kind, postType, title, text: text ?? "" });

  switch (kind) {
    case "POST": {
      const r = await one("community_posts", "title, body, type, hidden_at");
      return r && { input: input(r.title, r.body, r.type), hidden: r.hidden_at, name: r.title || "a post" };
    }
    case "COMMENT": {
      const r = await one("post_comments", "body, post_id, hidden_at");
      if (!r) return null;
      const { data: post } = await sb.from("community_posts").select("title, type").eq("id", r.post_id).maybeSingle();
      return {
        input: input(post?.title ?? null, r.body, post?.type ?? null),
        hidden: r.hidden_at,
        name: `a comment on ${post?.title ? `"${post.title}"` : "a post"}`,
      };
    }
    case "RATING": {
      const r = await one("ratings", "comment, hidden_at");
      return r && { input: input(null, r.comment), hidden: r.hidden_at, name: "a review" };
    }
    case "REQUEST": {
      const r = await one("requests", "title, description, hidden_at");
      return r && { input: input(r.title, r.description), hidden: r.hidden_at, name: r.title || "a request" };
    }
    case "STORY": {
      const r = await one("stories", "caption, hidden_at");
      return r && { input: input(null, r.caption), hidden: r.hidden_at, name: "a story" };
    }
    case "BULK_DEAL": {
      const r = await one("bulk_deals", "title, description, hidden_at");
      return r && { input: input(r.title, r.description), hidden: r.hidden_at, name: r.title || "a bulk deal" };
    }
    case "BUSINESS": {
      const r = await one("businesses", "name, description");
      return r && { input: input(r.name, r.description), hidden: null, name: r.name || "a business" };
    }
    case "PROVIDER": {
      const r = await one("providers", "display_name, bio");
      return r && { input: input(r.display_name, r.bio), hidden: null, name: r.display_name || "a provider" };
    }
  }
}

/** The automatic check for one item: hide it and/or file it for a moderator, per the verdict. */
async function checkContent(sb: Admin, apiKey: string, targetType: ContentKind, targetId: string) {
  const loaded = await loadContent(sb, targetType, targetId);
  if (!loaded) return { ok: true, skipped: "gone" };
  const { input, hidden, name } = loaded;
  if (!input.text.trim() && !input.title?.trim()) return { ok: true, skipped: "empty" };

  const verdict = await classifyContent(input, {
    apiKey,
    fetch,
    model: Deno.env.get("TYPESAFE_MODEL") || undefined,
  });
  if (verdict.action === "pass") return { ok: true, verdict };

  const table = HIDE_TABLE[targetType];
  if (verdict.action === "hide" && !hidden && table) {
    const { error } = await sb.from(table)
      .update({ hidden_at: new Date().toISOString(), hidden_reason: "AUTO_CHECK" })
      .eq("id", targetId).is("hidden_at", null);
    if (error) throw error;
  }

  // One open automatic report per item: an edit that is flagged again does not add a second.
  const { data: open, error: openError } = await sb
    .from("reports").select("id")
    .eq("target_type", targetType).eq("target_id", targetId).eq("reason", "AUTO_CHECK")
    .in("status", ["OPEN", "REVIEWING"]).limit(1);
  if (openError) throw openError;
  if (!open || open.length === 0) {
    const { error } = await sb.from("reports").insert({
      target_type: targetType,
      target_id: targetId,
      target_name: name.slice(0, 200),
      reason: "AUTO_CHECK",
      details: verdictSummary(verdict),
      reporter_user_id: null,
    });
    if (error) throw error;
  }
  return { ok: true, verdict };
}

/** Advisory triage for one user report, for the moderator's queue. */
async function triageReport(sb: Admin, apiKey: string, reportId: string) {
  const { data: report, error: reportError } = await sb
    .from("reports")
    .select("id, target_type, target_id, reason, details")
    .eq("id", reportId)
    .maybeSingle();
  if (reportError) throw reportError;
  if (!report) return { status: 404, body: { ok: false, message: "Report not found" } };
  if (!CLASSIFIABLE.includes(report.target_type)) {
    return {
      status: 422,
      body: { ok: false, message: `Only reports on community posts and comments are classified, not ${report.target_type}` },
    };
  }

  let input: ReportInput;
  if (report.target_type === "POST") {
    const { data: post, error } = await sb
      .from("community_posts").select("title, body, type").eq("id", report.target_id).maybeSingle();
    if (error) throw error;
    if (!post) return { status: 404, body: { ok: false, message: "The reported post no longer exists" } };
    input = { kind: "POST", reason: report.reason, details: report.details ?? "", postType: post.type, title: post.title, text: post.body ?? "" };
  } else {
    const { data: comment, error } = await sb
      .from("post_comments").select("body, post_id").eq("id", report.target_id).maybeSingle();
    if (error) throw error;
    if (!comment) return { status: 404, body: { ok: false, message: "The reported comment no longer exists" } };
    const { data: post } = await sb
      .from("community_posts").select("title, type").eq("id", comment.post_id).maybeSingle();
    input = { kind: "COMMENT", reason: report.reason, details: report.details ?? "", postType: post?.type ?? null, title: post?.title ?? null, text: comment.body };
  }

  const triage = await classifyReport(input, {
    apiKey,
    fetch,
    model: Deno.env.get("TYPESAFE_MODEL") || undefined,
  });
  return { status: 200, body: { ok: true, reportId, triage } };
}

serve(async (req) => {
  const CORS = corsHeaders(req);
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: CORS });
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reply({ ok: false, message: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, secretKey());
    const apiKey = Deno.env.get("TYPESAFE_API_KEY") ?? "";

    // ── From the database trigger: check one new or edited post or comment ──
    if (isInternalCall(req)) {
      if (body.action !== "check_content") return reply({ ok: false, message: "Unknown action" }, 400);
      if (!apiKey) return reply({ ok: false, message: "Content check is not configured (TYPESAFE_API_KEY)" }, 503);
      const { targetType, targetId } = body;
      if (!CONTENT_KINDS.includes(targetType) || typeof targetId !== "string" || !targetId || targetId.length > 100) {
        return reply({ ok: false, message: `targetType (${CONTENT_KINDS.join(", ")}) and targetId are required` }, 400);
      }
      return reply(await checkContent(sb, apiKey, targetType, targetId));
    }

    // ── From an admin: triage a user report ──
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (!token) return reply({ ok: false, message: "Missing authorization header" }, 401);
    const { data: { user }, error: authError } = await sb.auth.getUser(token);
    if (authError || !user) return reply({ ok: false, message: "Invalid or expired token" }, 401);

    // Same admin gate as verification-review and admin-delete-profile.
    const { data: me } = await sb.from("users").select("roles").eq("id", user.id).maybeSingle();
    const roles: string[] = me?.roles ?? [];
    if (!roles.includes("admin") && !roles.includes("super_admin")) {
      return reply({ ok: false, message: "Forbidden: Admin privileges required" }, 403);
    }
    if (!apiKey) return reply({ ok: false, message: "Report classification is not configured (TYPESAFE_API_KEY)" }, 503);

    const action = body.action ?? "classify_report";
    if (action !== "classify_report") return reply({ ok: false, message: "Unknown action" }, 400);
    const { reportId } = body;
    if (typeof reportId !== "string" || reportId.length === 0 || reportId.length > 100) {
      return reply({ ok: false, message: "reportId is required" }, 400);
    }
    const result = await triageReport(sb, apiKey, reportId);
    return reply(result.body, result.status);
  } catch (e) {
    const message = e instanceof Error ? e.message : (e as { message?: string })?.message ?? "Moderation failed";
    console.error("moderation failed:", message);
    return reply({ ok: false, message }, 502);
  }
});
