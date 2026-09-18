/**
 * The message to show a person when something failed.
 *
 * Almost every catch block in this codebase was written as `catch (e: any)` so it could reach `e?.message`.
 * That `any` is not free: it also silences every other property access on the error, so a typo like
 * `e?.mesage` reads as undefined and the user gets the fallback forever, with nothing to say why.
 *
 * With `catch (e)` the error is `unknown`, which is what it actually is — anything can be thrown — and this
 * does the narrowing in one place that has tests.
 */

/**
 * True when the value carries a usable string `message`.
 *
 * Reading the property is wrapped because reading it can throw: `message` may be a getter, and this function
 * runs inside catch blocks. An error handler that throws turns a handled failure into an unhandled one, which
 * is strictly worse than the failure it was handling.
 */
function hasMessage(err: unknown): err is { message: string } {
  try {
    return (
      typeof err === "object" &&
      err !== null &&
      "message" in err &&
      typeof (err as { message: unknown }).message === "string" &&
      (err as { message: string }).message.trim().length > 0
    );
  } catch {
    return false;
  }
}

/**
 * Pulls a human-readable message out of anything, falling back when there is nothing worth showing.
 *
 * The fallback is used for an empty or whitespace-only message as well as a missing one: "" reaching a toast
 * renders an empty bar, which reads as a glitch rather than as an error.
 */
export function errorMessage(err: unknown, fallback = "Something went wrong. Please try again."): string {
  if (typeof err === "string" && err.trim()) return err;
  if (hasMessage(err)) return err.message;
  return fallback;
}

/**
 * The error's machine-readable code, when it has one — Postgres puts SQLSTATE here (`23505` for a unique
 * violation), and Supabase passes it through.
 */
export function errorCode(err: unknown): string | undefined {
  try {
    if (typeof err === "object" && err !== null && "code" in err) {
      const code = (err as { code: unknown }).code;
      if (typeof code === "string" || typeof code === "number") return String(code);
    }
  } catch {
    /* same reason as hasMessage: never throw from a failure path */
  }
  return undefined;
}
