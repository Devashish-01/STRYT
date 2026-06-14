// Supabase-flavored helpers that keep the existing frontend contracts intact:
//  - Page<T> with { data, page: { next_cursor, has_more } }
//  - ApiError with { code, message, fields }
// so screens, useApi, and ErrorView need zero changes when the backend is real.
import { ApiError, type Page } from "./apiClient";
import { toCamel } from "./caseMap";

const DEFAULT_LIMIT = 20;

/** Parse a numeric-offset cursor (same scheme as the mock paginate()). */
export function cursorToRange(cursor?: string | null, limit = DEFAULT_LIMIT) {
  const from = cursor ? parseInt(cursor, 10) || 0 : 0;
  const to = from + limit - 1; // supabase .range() is inclusive
  return { from, to, limit };
}

/**
 * Wrap a Supabase list result (rows + count) into the app's Page<T> shape,
 * converting rows to camelCase. Pass the `count` from a
 * .select('*', { count: 'exact' }) query.
 */
export function toPage<T>(
  rows: unknown[] | null,
  count: number | null,
  from: number,
  limit = DEFAULT_LIMIT
): Page<T> {
  const data = toCamel<T[]>(rows ?? []);
  const nextStart = from + (rows?.length ?? 0);
  const hasMore = count != null ? nextStart < count : (rows?.length ?? 0) === limit;
  return {
    data,
    page: { next_cursor: hasMore ? String(nextStart) : null, has_more: hasMore },
  };
}

/** Map a supabase-js PostgrestError into the app's ApiError envelope. */
export function toApiError(err: unknown, fallbackStatus = 400): ApiError {
  const e = err as { code?: string; message?: string; details?: string } | null;
  const code = e?.code ?? "INTERNAL";
  const message = e?.message ?? "Something went wrong";
  return new ApiError(fallbackStatus, { code, message });
}

/** Throw a normalized ApiError if a supabase response carries one. */
export function throwIfError(error: unknown): void {
  if (error) throw toApiError(error);
}
