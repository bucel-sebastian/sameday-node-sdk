import { describe, expect, it } from 'vitest';

import { SamedayClient } from '../src/client';
import { UitCodesResource } from '../src/resources/uit-codes';
import { getBody, getHeaders, jsonResponse } from './helpers';

interface RecordedCall {
  url: string;
  init: RequestInit | undefined;
}

const isAuthUrl = (url: string): boolean => url.endsWith('/api/authenticate');

/** Creates a UitCodesResource on a client wired to a routing fetch mock. */
function setup(router: (call: RecordedCall) => Response): {
  resource: UitCodesResource;
  /** Recorded calls, excluding the transparent authenticate request. */
  dataCalls: () => RecordedCall[];
} {
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
    return router(call);
  };
  const client = new SamedayClient({ user: 'demo-user', password: 'demo-pass', fetchImpl });
  return {
    resource: new UitCodesResource(client),
    dataCalls: () => calls.filter((call) => !isAuthUrl(call.url)),
  };
}

const pathOf = (call: RecordedCall): string => new URL(call.url).pathname;
const queryOf = (call: RecordedCall): URLSearchParams => new URL(call.url).searchParams;

const SYNC_PAGE = {
  currentPage: 1,
  perPage: 500,
  data: [
    {
      parcelNumber: 'SDD1234567',
      history: [{ registrationNumber: 'RO-REG-1', uitCode: 'UIT-1', createdDate: '2026-01-02' }],
    },
  ],
};

describe('UitCodesResource.sync', () => {
  it('requests GET /api/client/uit-code-sync with pagination and timestamps', async () => {
    const { resource, dataCalls } = setup(() => jsonResponse(SYNC_PAGE));

    const result = await resource.sync({
      page: 1,
      countPerPage: 500,
      startTimestamp: '2026-01-01',
      endTimestamp: '2026-01-02',
    });

    const [call] = dataCalls();
    expect(call.init?.method).toBe('GET');
    expect(pathOf(call)).toBe('/api/client/uit-code-sync');
    expect(queryOf(call).get('page')).toBe('1');
    expect(queryOf(call).get('countPerPage')).toBe('500');
    expect(queryOf(call).get('startTimestamp')).toBe('2026-01-01');
    expect(queryOf(call).get('endTimestamp')).toBe('2026-01-02');
    expect(result.currentPage).toBe(1);
    expect(result.data[0].parcelNumber).toBe('SDD1234567');
    expect(result.data[0].history[0].uitCode).toBe('UIT-1');
  });

  it('sends no query string when called without filters', async () => {
    const { resource, dataCalls } = setup(() => jsonResponse({ currentPage: 1, perPage: 500, data: [] }));

    await resource.sync();

    const [call] = dataCalls();
    expect(new URL(call.url).search).toBe('');
  });
});

describe('UitCodesResource.saveUitCode', () => {
  it('sends PATCH /api/awb/{parcelNumber}/uit-code with the form-encoded payload', async () => {
    const { resource, dataCalls } = setup(() =>
      jsonResponse({ success: { code: 200, message: 'UIT code saved' } }),
    );

    const result = await resource.saveUitCode('SDD1234567', {
      uitCode: 'UIT-1',
      registrationNumber: 'RO-REG-1',
    });

    const [call] = dataCalls();
    expect(call.init?.method).toBe('PATCH');
    expect(pathOf(call)).toBe('/api/awb/SDD1234567/uit-code');
    expect(getHeaders(call.init)['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(getBody(call.init)).toBe('uitCode=UIT-1&registrationNumber=RO-REG-1');
    expect(result.success).toEqual({ code: 200, message: 'UIT code saved' });
  });

  it('omits fields that were not provided and encodes the parcel number', async () => {
    const { resource, dataCalls } = setup(() =>
      jsonResponse({ success: { code: 200, message: 'ok' } }),
    );

    await resource.saveUitCode('SD 77', { uitCode: 'UIT 2' });

    const [call] = dataCalls();
    expect(pathOf(call)).toBe('/api/awb/SD%2077/uit-code');
    expect(getBody(call.init)).toBe('uitCode=UIT+2');
  });
});
