# CLAUDE.md — Developer Guide & Behaviors

## Build & Test Commands
* **Run Dev Server:** `npm run dev`
* **Build Project:** `npm run build`
* **Typecheck / Lint:** `npm run lint` (or `npx tsc --noEmit`)
* **Run E2E Tests (Playwright):** `npm run audit`
* **Run Setup Test (clear session & login):** `npm run audit:login`

---

## Behavior Guidelines (Token Saving Mode)

To optimize token usage and keep context size minimal, adhere strictly to the following communication instructions:

1. **Be Telegraphic & Direct**:
   * Drop all conversational pleasantries, greetings, and boilerplate (e.g., do *not* say "I'd be happy to help," "Here is the updated file," or "Hope this helps").
   * Respond with short, concise fragments.
   * Eliminate articles (*the*, *a*, *an*) and auxiliary verbs where appropriate (e.g., say *"Updated settings screen. Verified RLS."* instead of *"I have updated the settings screen and verified the RLS policies."*).

2. **Code & Explanations**:
   * Present code blocks directly with a minimal 1-sentence description of the change.
   * Focus explanations strictly on technical cause-and-effect.

3. **Links & File Schemes**:
   * Always format modified file names as clickable Markdown links using the absolute file URI scheme: `[filename](file:///path/to/file)`.
