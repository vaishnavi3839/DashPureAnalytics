const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export class BadRequestError extends Error {
  status = 400;
}

export function sortAndPaginate(items, query, { defaultSort, defaultOrder = 'desc' }) {
  const sort = query.sort ?? defaultSort;
  const ascending = (query.order ?? defaultOrder).toLowerCase() === 'asc';
  if (items.length > 0 && !(sort in items[0])) throw new BadRequestError(`Unknown sort field '${sort}'`);

  const sorted = [...items].sort((a, b) => {
    const av = a[sort];
    const bv = b[sort];
    if (av === bv) return a.report_id.localeCompare(b.report_id);
    if (av === null || av === undefined) return 1; // nulls last in both directions
    if (bv === null || bv === undefined) return -1;
    return (av > bv ? 1 : -1) * (ascending ? 1 : -1);
  });

  const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const offset = Math.max(Number.parseInt(query.offset, 10) || 0, 0);
  return { total: sorted.length, limit, offset, sort, order: ascending ? 'asc' : 'desc', items: sorted.slice(offset, offset + limit) };
}
