import { describe, expect, it } from 'vitest';

import { SamedayClient } from '../src/client';
import { StandbyReturnsResource } from '../src/resources/standby-returns';
import { jsonResponse } from './helpers';

interface RecordedCall {
  url: string;
  init: RequestInit | undefined;
}

const isAuthUrl = (url: string): boolean => url.endsWith('/api/authenticate');

/** Creates a StandbyReturnsResource on a client wired to a routing fetch mock. */
function setup(router: (call: RecordedCall) => Response): {
  resource: StandbyReturnsResource;
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
    resource: new StandbyReturnsResource(client),
    dataCalls: () => calls.filter((call) => !isAuthUrl(call.url)),
  };
}

const pathOf = (call: RecordedCall): string => new URL(call.url).pathname;
const queryOf = (call: RecordedCall): URLSearchParams => new URL(call.url).searchParams;

function standbyAwb(awbNumber: string): Record<string, unknown> {
  return {
    seller: 'Seller SRL',
    awbNumber,
    serviceId: 3,
    createdAt: '2026-01-05T12:00:00',
    phone: '0712345678',
    email: 'buyer@example.com',
    status: 12,
    thirdPartyName: 'Buyer Name',
    observation: 'return to sender',
  };
}

describe('StandbyReturnsResource.list', () => {
  it('requests GET /api/client/standby-returns with all filters', async () => {
    const { resource, dataCalls } = setup(() =>
      jsonResponse({
        total: 1,
        currentPage: 2,
        pages: 2,
        perPage: 25,
        data: [standbyAwb('SDD1234567')],
      }),
    );

    const page = await resource.list({
      page: 2,
      countPerPage: 25,
      seller: 7,
      awbNumber: 'SDD1234567',
      serviceId: 3,
      startInterval: '2026-01-01 00:00:00',
      endInterval: '2026-03-01 00:00:00',
      phone: '0712345678',
      email: 'buyer@example.com',
      thirdPartyName: 'Buyer Name',
      observation: 'return to sender',
      sortBy: 'createdAt',
      order: 'desc',
    });

    const [call] = dataCalls();
    expect(call.init?.method).toBe('GET');
    expect(pathOf(call)).toBe('/api/client/standby-returns');
    expect(Object.fromEntries(queryOf(call))).toEqual({
      page: '2',
      countPerPage: '25',
      seller: '7',
      awbNumber: 'SDD1234567',
      serviceId: '3',
      startInterval: '2026-01-01 00:00:00',
      endInterval: '2026-03-01 00:00:00',
      phone: '0712345678',
      email: 'buyer@example.com',
      thirdPartyName: 'Buyer Name',
      observation: 'return to sender',
      sortBy: 'createdAt',
      order: 'desc',
    });
    expect(page.pages).toBe(2);
    expect(page.data[0].awbNumber).toBe('SDD1234567');
  });

  it('sends no query string when called without filters', async () => {
    const { resource, dataCalls } = setup(() =>
      jsonResponse({ total: 0, currentPage: 1, pages: 0, perPage: 500, data: [] }),
    );

    await resource.list();

    const [call] = dataCalls();
    expect(new URL(call.url).search).toBe('');
  });

  it('iterate walks every page with the API-default countPerPage and then stops', async () => {
    const { resource, dataCalls } = setup((call) => {
      const currentPage = Number(queryOf(call).get('page'));
      const data = currentPage === 1 ? [standbyAwb('A1'), standbyAwb('A2')] : [standbyAwb('A3')];
      return jsonResponse({ total: 3, currentPage, pages: 2, perPage: 2, data });
    });

    const numbers: string[] = [];
    for await (const item of resource.iterate({ seller: 7 })) {
      numbers.push(item.awbNumber);
    }

    expect(numbers).toEqual(['A1', 'A2', 'A3']);
    const calls = dataCalls();
    expect(calls).toHaveLength(2);
    expect(queryOf(calls[0]).get('page')).toBe('1');
    expect(queryOf(calls[1]).get('page')).toBe('2');
    expect(queryOf(calls[0]).get('countPerPage')).toBe('500');
    // Filters are forwarded on every page.
    expect(queryOf(calls[0]).get('seller')).toBe('7');
    expect(queryOf(calls[1]).get('seller')).toBe('7');
  });

  it('iterate honors a custom countPerPage', async () => {
    const { resource, dataCalls } = setup((call) => {
      const currentPage = Number(queryOf(call).get('page'));
      const data = currentPage === 1 ? [standbyAwb('B1')] : [standbyAwb('B2')];
      return jsonResponse({ total: 2, currentPage, pages: 2, perPage: 1, data });
    });

    const numbers: string[] = [];
    for await (const item of resource.iterate({}, { countPerPage: 1 })) {
      numbers.push(item.awbNumber);
    }

    expect(numbers).toEqual(['B1', 'B2']);
    const calls = dataCalls();
    expect(queryOf(calls[1]).get('countPerPage')).toBe('1');
  });
});
