/**
 * Live-API integration: read-only paginated catalogues.
 *
 * Opt-in (env-gated): `SAMEDAY_USER=x SAMEDAY_PASSWORD=y SAMEDAY_ENV=demo npm run test:integration`.
 * Skipped entirely when credentials are absent, so `npm test` stays green.
 *
 * `status.list()` (`/api/public/status-list`) is the safest paginated call in
 * the API (its spec even returns the public statuses without auth); it is
 * paired with `services.list()` to also exercise the unusual form-body
 * pagination path.
 */
import { beforeAll, describe, expect, it } from 'vitest';

import type { SamedayClient } from '../../src/client';
import { createClient, hasCredentials, TEST_TIMEOUT_MS } from './helpers';

describe.skipIf(!hasCredentials())('live API: read-only catalogues', () => {
  let client: SamedayClient;

  beforeAll(() => {
    client = createClient();
  });

  it('status.list() returns the paginated status catalogue', async () => {
    const page = await client.status.list({ countPerPage: 10 });

    expect(typeof page.total).toBe('number');
    expect(page.total).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(page.data)).toBe(true);
    expect(page.data.length).toBeGreaterThan(0);
    expect(typeof page.data[0].id).toBe('number');
    expect(typeof page.data[0].label).toBe('string');
  }, TEST_TIMEOUT_MS);

  it('services.list() returns the paginated services catalogue', async () => {
    const page = await client.services.list({ countPerPage: 10 });

    expect(typeof page.total).toBe('number');
    expect(page.total).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(page.data)).toBe(true);
    expect(page.data.length).toBeGreaterThan(0);
    expect(typeof page.data[0].id).toBe('number');
  }, TEST_TIMEOUT_MS);
});
