/**
 * Live-API integration: the X-AUTH flow end-to-end.
 *
 * Opt-in (env-gated): `SAMEDAY_USER=x SAMEDAY_PASSWORD=y SAMEDAY_ENV=demo npm run test:integration`.
 * Skipped entirely when credentials are absent, so `npm test` stays green.
 *
 * NOTE (known caveat): the demo API currently rejects the known test
 * credentials with 403 "Invalid credentials" — when that happens this suite
 * FAILS here with `PermissionError` by design. The failure is the signal that
 * credentials are bad; the test is deliberately not weakened to mask it.
 */
import { beforeAll, describe, expect, it } from 'vitest';

import type { SamedayClient } from '../../src/client';
import { createClient, hasCredentials, TEST_TIMEOUT_MS } from './helpers';

describe.skipIf(!hasCredentials())('live API: authentication', () => {
  let client: SamedayClient;

  // Clients are only ever built inside a gated suite — `beforeAll` never runs
  // when the suite is skipped, so plain `npm test` cannot trip construction.
  beforeAll(() => {
    client = createClient();
  });

  it('ensureToken() returns a non-empty token (X-AUTH flow end-to-end)', async () => {
    const token = await client.ensureToken();

    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
  }, TEST_TIMEOUT_MS);
});
