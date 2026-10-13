/**
 * Shared helpers for the opt-in integration suite.
 *
 * HOW TO RUN
 * ----------
 *   SAMEDAY_USER=x SAMEDAY_PASSWORD=y SAMEDAY_ENV=demo npm run test:integration
 *
 * The suite is env-gated: when `SAMEDAY_USER` / `SAMEDAY_PASSWORD` are absent
 * every test SKIPS (exit 0), so plain `npm test` and CI runs without secrets
 * stay green. `SAMEDAY_ENV` accepts `prod` or `demo` and defaults to `demo`.
 *
 * All live tests are read-only or non-committing (authenticate, paginated
 * catalogues, price estimates) — nothing creates, edits or cancels real AWBs.
 */

import { DEMO_BASE_URL, PROD_BASE_URL, SamedayClient } from '../../src/client';
import type { SamedayEnvironment } from '../../src/types';
import { getHeaders } from '../helpers';

/** Per-request timeout for live calls (below the per-test vitest timeout). */
export const REQUEST_TIMEOUT_MS = 15_000;

/** Per-test vitest timeout for network calls. */
export const TEST_TIMEOUT_MS = 20_000;

/** Credentials read from the environment. */
export interface IntegrationCredentials {
  user: string;
  password: string;
  environment: SamedayEnvironment;
}

/**
 * Reads credentials from the environment. Returns `null` when the opt-in
 * variables are absent — the exact value every suite gates on. Safe to call
 * at module top-level: it only reads env vars, never builds a client or
 * touches the network.
 */
export function credentials(): IntegrationCredentials | null {
  const user = process.env.SAMEDAY_USER;
  const password = process.env.SAMEDAY_PASSWORD;
  if (user === undefined || user === '' || password === undefined || password === '') {
    return null;
  }
  const environment: SamedayEnvironment =
    process.env.SAMEDAY_ENV === 'prod' ? 'prod' : 'demo';
  return { user, password, environment };
}

/** True when the opt-in credentials are present (=> tests should actually run). */
export function hasCredentials(): boolean {
  return credentials() !== null;
}

/**
 * Builds a client for the live API. Throws when credentials are missing —
 * only ever call it from inside a `describe.skipIf(!hasCredentials())` body
 * (e.g. `beforeAll`, which skipped suites never execute), never at module
 * top-level, so `npm test` without env vars cannot fail during collection.
 */
export function createClient(fetchImpl?: typeof fetch): SamedayClient {
  const creds = credentials();
  if (creds === null) {
    throw new Error(
      'Integration credentials are missing: set SAMEDAY_USER and SAMEDAY_PASSWORD ' +
        '(and optionally SAMEDAY_ENV=demo|prod) to run the integration suite.',
    );
  }
  return new SamedayClient({ ...creds, timeoutMs: REQUEST_TIMEOUT_MS, fetchImpl });
}

/** One outgoing HTTP request recorded by {@link createCapturingClient}. */
export interface CapturedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  /** Body exactly as it goes on the wire (percent-encoding included). */
  body: string;
}

/**
 * A `fetch` that records every request (URL + wire body + headers) into
 * `requests` and then forwards it to the real network. The captured bytes let
 * wire-format assertions (e.g. bracket-encoding) run regardless of the
 * response status — once a request has been captured it has already been
 * fully serialized.
 */
export function createCapturingFetch(requests: CapturedRequest[]): typeof fetch {
  return async (input, init) => {
    requests.push({
      url: String(input),
      method: init?.method ?? 'GET',
      headers: getHeaders(init),
      body: typeof init?.body === 'string' ? init.body : '',
    });
    return fetch(input, init);
  };
}

/**
 * Client wired to {@link createCapturingFetch}: every authenticated request
 * the SDK dispatches is recorded before hitting the real API.
 */
export function createCapturingClient(): {
  client: SamedayClient;
  requests: CapturedRequest[];
} {
  const requests: CapturedRequest[] = [];
  return { client: createClient(createCapturingFetch(requests)), requests };
}

/** Base URL the gated client is pointed at (mirrors `createClient`). */
export function baseUrl(): string {
  return credentials()?.environment === 'prod' ? PROD_BASE_URL : DEMO_BASE_URL;
}

/** Last recorded request whose URL contains `pathFragment`, if any. */
export function lastRequestTo(
  requests: CapturedRequest[],
  pathFragment: string,
): CapturedRequest | undefined {
  return [...requests].reverse().find((recorded) => recorded.url.includes(pathFragment));
}
