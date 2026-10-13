/**
 * Live-API integration: geolocation lookups (read-only).
 *
 * Opt-in (env-gated): `SAMEDAY_USER=x SAMEDAY_PASSWORD=y SAMEDAY_ENV=demo npm run test:integration`.
 * Skipped entirely when credentials are absent, so `npm test` stays green.
 */
import { beforeAll, describe, expect, it } from 'vitest';

import type { SamedayClient } from '../../src/client';
import { createClient, hasCredentials, TEST_TIMEOUT_MS } from './helpers';

describe.skipIf(!hasCredentials())('live API: geolocation', () => {
  let client: SamedayClient;

  beforeAll(() => {
    client = createClient();
  });

  it('counties() returns a paginated payload', async () => {
    const page = await client.geolocation.counties();

    expect(typeof page.total).toBe('number');
    expect(page.total).toBeGreaterThanOrEqual(1);
    expect(typeof page.pages).toBe('number');
    expect(page.pages).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(page.data)).toBe(true);
    expect(page.data.length).toBeGreaterThan(0);
    expect(typeof page.data[0].id).toBe('number');
    expect(typeof page.data[0].name).toBe('string');
  }, TEST_TIMEOUT_MS);

  it('walks more than one page with a small countPerPage', async () => {
    const first = await client.geolocation.counties({ countPerPage: 5, page: 1 });
    expect(first.data.length).toBeGreaterThan(0);
    expect(first.data.length).toBeLessThanOrEqual(5);
    expect(first.pages).toBeGreaterThan(1);

    const second = await client.geolocation.counties({ countPerPage: 5, page: 2 });
    expect(second.currentPage).toBe(2);
    expect(second.data.length).toBeGreaterThan(0);

    // The generator must actually cross the page boundary: with countPerPage 5
    // and maxPages 2, collecting MORE than one page's worth of items proves
    // a >1 page walk happened.
    const seen: number[] = [];
    for await (const county of client.geolocation.iterateCounties(
      {},
      { countPerPage: 5, maxPages: 2 },
    )) {
      seen.push(county.id ?? -1);
    }
    expect(seen.length).toBeGreaterThan(5);
    expect(seen.length).toBeLessThanOrEqual(10);
  }, TEST_TIMEOUT_MS);
});
