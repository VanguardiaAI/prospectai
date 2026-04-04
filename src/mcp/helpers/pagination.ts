const MAX_LIMIT = 20;

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export function paginate<T>(items: T[], page?: number, limit?: number): PaginatedResult<T> {
  const p = Math.max(1, page ?? 1);
  const l = Math.min(MAX_LIMIT, Math.max(1, limit ?? 10));
  const start = (p - 1) * l;
  const sliced = items.slice(start, start + l);
  return {
    items: sliced,
    total: items.length,
    page: p,
    limit: l,
    hasMore: start + l < items.length,
  };
}

export function paginationParams(page?: number, limit?: number) {
  const p = Math.max(1, page ?? 1);
  const l = Math.min(MAX_LIMIT, Math.max(1, limit ?? 10));
  return { page: p, limit: l, offset: (p - 1) * l };
}
