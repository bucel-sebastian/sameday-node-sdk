import { describe, expect, it } from 'vitest';
import { iteratePaginated } from '../src/http/paginate';
import type { Paginated } from '../src/types';

function page<T>(data: T[], currentPage: number, pages: number): Paginated<T> {
  return { total: pages * data.length, currentPage, pages, perPage: data.length, data };
}

async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of gen) out.push(item);
  return out;
}

describe('iteratePaginated', () => {
  it('yields items across multiple pages', async () => {
    const pages = [
      page(['a', 'b'], 1, 3),
      page(['c', 'd'], 2, 3),
      page(['e'], 3, 3),
    ];
    const calls: number[] = [];
    const gen = iteratePaginated(async (p) => {
      calls.push(p);
      return pages[p - 1];
    });
    await expect(collect(gen)).resolves.toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(calls).toEqual([1, 2, 3]);
  });

  it('stops immediately for an empty first page', async () => {
    const gen = iteratePaginated(async () => page([], 1, 0));
    await expect(collect(gen)).resolves.toEqual([]);
  });

  it('ignores inflated pages values when a page is empty', async () => {
    let calls = 0;
    const gen = iteratePaginated(async () => {
      calls += 1;
      return page(calls === 1 ? ['only'] : [], calls, 99);
    });
    await expect(collect(gen)).resolves.toEqual(['only']);
    expect(calls).toBe(2);
  });

  it('passes countPerPage and startPage through', async () => {
    const seen: Array<{ page: number; count: number }> = [];
    const gen = iteratePaginated(
      async (p, count) => {
        seen.push({ page: p, count });
        return page([p], p, 2);
      },
      { countPerPage: 10, startPage: 1 },
    );
    await collect(gen);
    expect(seen).toEqual([
      { page: 1, count: 10 },
      { page: 2, count: 10 },
    ]);
  });

  it('respects maxPages', async () => {
    let calls = 0;
    const gen = iteratePaginated(
      async (p) => {
        calls += 1;
        return page([p], p, 10);
      },
      { maxPages: 3 },
    );
    await expect(collect(gen)).resolves.toEqual([1, 2, 3]);
    expect(calls).toBe(3);
  });

  it('propagates fetch errors', async () => {
    const gen = iteratePaginated(async (p) => {
      if (p === 2) throw new Error('boom');
      return page(['a'], 1, 3);
    });
    await expect(collect(gen)).rejects.toThrow('boom');
  });

  it('tolerates missing pages/data fields', async () => {
    const gen = iteratePaginated(async () => ({ currentPage: 1, perPage: 0 }) as Paginated<string>);
    await expect(collect(gen)).resolves.toEqual([]);
  });

  it('supports early break', async () => {
    let calls = 0;
    const gen = iteratePaginated(async (p) => {
      calls += 1;
      return page([p, p + 100], p, 5);
    });
    const first: number[] = [];
    for await (const item of gen) {
      first.push(item);
      if (first.length === 3) break;
    }
    expect(first).toEqual([1, 101, 2]);
    expect(calls).toBeLessThanOrEqual(2);
  });
});
