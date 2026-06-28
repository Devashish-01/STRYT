export function mockDelay<T>(value: T, ms = 280): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

// Simple in-memory cursor pagination over an array.
export function paginate<T>(items: T[], cursor?: string | null, limit = 20) {
  const start = cursor ? parseInt(cursor, 10) || 0 : 0;
  const slice = items.slice(start, start + limit);
  const next = start + limit;
  return {
    data: slice,
    page: { next_cursor: next < items.length ? String(next) : null, has_more: next < items.length },
  };
}
