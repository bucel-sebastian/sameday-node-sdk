import { describe, expect, it } from 'vitest';

import { SamedayClient } from '../src/client';
import { LedgerResource } from '../src/resources/ledger';
import { getHeaders, jsonResponse } from './helpers';

interface RecordedCall {
  url: string;
  init: RequestInit | undefined;
}

const isAuthUrl = (url: string): boolean => url.endsWith('/api/authenticate');

/** Creates a LedgerResource on a client wired to a routing fetch mock. */
function setup(body: string): { resource: LedgerResource; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const call: RecordedCall = { url: String(input), init };
    calls.push(call);
    if (isAuthUrl(call.url)) {
      return jsonResponse({
        token: 'tok-1',
        expire_at_utc: new Date(Date.now() + 3_600_000).toISOString(),
      });
    }
    return new Response(body, { status: 200, headers: { 'content-type': 'text/csv' } });
  };
  const client = new SamedayClient({ user: 'demo-user', password: 'demo-pass', fetchImpl });
  return { resource: new LedgerResource(client), calls };
}

const pathOf = (call: RecordedCall): string => new URL(call.url).pathname;
const queryOf = (call: RecordedCall): URLSearchParams => new URL(call.url).searchParams;
const dataCalls = (calls: RecordedCall[]): RecordedCall[] =>
  calls.filter((call) => !isAuthUrl(call.url));

const CSV = 'awbNumber,codAmount\nSDD1,12.5\n';

describe('LedgerResource.downloadCodLedger', () => {
  it('requests GET /api/client/cod-ledger-download with the date range and returns a Buffer', async () => {
    const { resource, calls } = setup(CSV);

    const result = await resource.downloadCodLedger({
      startDate: '2026-01-01',
      endDate: '2026-01-31',
    });

    const [call] = dataCalls(calls);
    expect(call.init?.method).toBe('GET');
    expect(pathOf(call)).toBe('/api/client/cod-ledger-download');
    expect(queryOf(call).get('startDate')).toBe('2026-01-01');
    expect(queryOf(call).get('endDate')).toBe('2026-01-31');
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.toString('utf8')).toBe('awbNumber,codAmount\nSDD1,12.5\n');
  });

  it('sends no query string when called without filters', async () => {
    const { resource, calls } = setup(CSV);

    await resource.downloadCodLedger();

    const [call] = dataCalls(calls);
    expect(new URL(call.url).search).toBe('');
    expect(getHeaders(call.init)['Content-Type']).toBeUndefined();
  });
});

describe('LedgerResource.validateTransferredLedgers', () => {
  it('requests GET /api/client/cod-transferred-ledgers-export with startDate/endDate as query params', async () => {
    const { resource, calls } = setup(CSV);

    const result = await resource.validateTransferredLedgers({
      startDate: '2026-02-01',
      endDate: '2026-02-28',
    });

    const [call] = dataCalls(calls);
    expect(call.init?.method).toBe('GET');
    expect(pathOf(call)).toBe('/api/client/cod-transferred-ledgers-export');
    expect(queryOf(call).get('startDate')).toBe('2026-02-01');
    expect(queryOf(call).get('endDate')).toBe('2026-02-28');
    // GET requests cannot carry a body — the spec declares query params only.
    expect(call.init?.body).toBeUndefined();
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.toString('utf8')).toBe(CSV);
  });
});

describe('LedgerResource.downloadInvoiceLedger', () => {
  it('requests the invoice ledger with the default attachment disposition', async () => {
    const { resource, calls } = setup(CSV);

    const result = await resource.downloadInvoiceLedger('241600000000');

    const [call] = dataCalls(calls);
    expect(call.init?.method).toBe('GET');
    expect(pathOf(call)).toBe('/api/client/download-ledger-for-invoice/241600000000/attachment');
    expect(new URL(call.url).search).toBe('');
    expect(Buffer.isBuffer(result)).toBe(true);
  });

  it('honours an explicit inline disposition and encodes the billing number', async () => {
    const { resource, calls } = setup(CSV);

    await resource.downloadInvoiceLedger('INV 42', 'inline');

    const [call] = dataCalls(calls);
    expect(pathOf(call)).toBe('/api/client/download-ledger-for-invoice/INV%2042/inline');
  });
});
