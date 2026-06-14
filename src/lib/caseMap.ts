// Boundary translator between the DB (snake_case) and the frontend types
// (camelCase). Use ONLY at the service boundary: toCamel() on read results,
// toSnake() on write payloads. The rest of the app stays camelCase.

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== "object") return false;
  if (Array.isArray(v)) return false;
  if (v instanceof Date) return false;
  // File/Blob exist only in the browser; guard for SSR/tests.
  if (typeof Blob !== "undefined" && v instanceof Blob) return false;
  if (typeof File !== "undefined" && v instanceof File) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function snakeKey(key: string): string {
  // camelCase -> snake_case. Already-snake keys round-trip unchanged.
  return key.replace(/([A-Z])/g, "_$1").toLowerCase();
}

function camelKey(key: string): string {
  // snake_case -> camelCase. Preserves a single leading underscore.
  const lead = key.startsWith("_") ? "_" : "";
  const body = lead ? key.slice(1) : key;
  return (
    lead +
    body.replace(/_([a-zA-Z0-9])/g, (_, c: string) => c.toUpperCase())
  );
}

function convert(input: unknown, keyFn: (k: string) => string): unknown {
  if (Array.isArray(input)) return input.map((item) => convert(item, keyFn));
  if (isPlainObject(input)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) {
      out[keyFn(k)] = convert(v, keyFn);
    }
    return out;
  }
  // null, undefined, primitives, Date, File, Blob — pass through untouched.
  return input;
}

/** snake_case -> camelCase, deep. Does not mutate input. */
export function toCamel<T = any>(input: unknown): T {
  return convert(input, camelKey) as T;
}

/** camelCase -> snake_case, deep. Does not mutate input. */
export function toSnake<T = any>(input: unknown): T {
  return convert(input, snakeKey) as T;
}
