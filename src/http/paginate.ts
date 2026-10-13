import type { Paginated } from '../types';

export interface IterateOptions {
  /** Items per page (API default: 500). */
  countPerPage?: number;
  /** First page to fetch (API default: 1). */
  startPage?: number;
  /** Safety cap on number of pages fetched. */
  maxPages?: number;
}

/**
 * Walks every page of a paginated Sameday endpoint, yielding items one by one.
 *
 * Stops when: the API reports no further pages (`pages`), a page returns no
 * data, or `maxPages` is reached. Errors from `fetchPage` propagate to the
 * caller. Supports early `break` (generator cleanup).
 *
 * @example
 * ```ts
 * for await (const point of client.pickupPoints.iterate()) {
 *   console.log(point.alias);
 * }
 * ```
 */
export async function* iteratePaginated<T>(
  fetchPage: (page: number, countPerPage: number) => Promise<Paginated<T>>,
  options: IterateOptions = {},
): AsyncGenerator<T, void, undefined> {
  const countPerPage = options.countPerPage ?? 500;
  const startPage = options.startPage ?? 1;
  let page = startPage;
  let totalPages = 1;

  while (page <= totalPages) {
    const response = await fetchPage(page, countPerPage);
    const items = response.data ?? [];
    totalPages = response.pages ?? 1;

    for (const item of items) {
      yield item;
    }

    // An empty page means there is nothing more to walk, regardless of
    // what `pages` claims (guards against inconsistent API totals).
    if (items.length === 0) {
      return;
    }

    page += 1;
    if (options.maxPages !== undefined && page - startPage >= options.maxPages) {
      return;
    }
  }
}
