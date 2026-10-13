import { describe, expect, it } from 'vitest';

import { SamedayClient } from '../src/client';
import { StatusResource } from '../src/resources/status';
import { getBody, getHeaders, jsonResponse } from './helpers';

interface RecordedCall {
  url: string;
  init: RequestInit | undefined;
}

const isAuthUrl = (url: string): boolean => url.endsWith('/api/authenticate');

function authResponse(): Response {
  return jsonResponse({
    token: 'tok-1',
    expire_at_utc: new Date(Date.now() + 3_600_000).toISOString(),
  });
}

/** Creates a StatusResource on a client wired to a routing fetch mock. */
function setup(router: (call: RecordedCall) => Response): {
  resource: StatusResource;
  /** Recorded calls, excluding the transparent authenticate request. */
  dataCalls: () => RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const call: RecordedCall = { url: String(input), init };
    calls.push(call);
    return isAuthUrl(call.url) ? authResponse() : router(call);
  };
  const client = new SamedayClient({ user: 'demo-user', password: 'demo-pass', fetchImpl });
  return {
    resource: new StatusResource(client),
    dataCalls: () => calls.filter((call) => !isAuthUrl(call.url)),
  };
}

const pathOf = (call: RecordedCall): string => new URL(call.url).pathname;
const queryOf = (call: RecordedCall): URLSearchParams => new URL(call.url).searchParams;

function entry(statusId: number): Record<string, unknown> {
  return {
    status: `AWB_${statusId}`,
    statusId,
    statusLabel: `Label ${statusId}`,
    statusState: 'AWB_DELIVERED',
    transitLocation: 'Bucharest',
    statusDate: '2026-01-01T10:00:00',
    parcelAwbNumber: `PCL${statusId}`,
  };
}

function statusItem(id: number): Record<string, unknown> {
  return { id, label: `Status ${id}`, reasons: [{ id: id * 10, name: `Reason ${id}` }] };
}

describe('StatusResource status-sync', () => {
  it('requests GET /api/client/status-sync with timestamps and pagination', async () => {
    const { resource, dataCalls } = setup(() =>
      jsonResponse({ currentPage: 1, perPage: 10, data: [entry(1)] }),
    );

    const result = await resource.sync({
      startTimestamp: '2026-01-01T00:00:00',
      endTimestamp: '2026-01-01T02:00:00',
      page: 3,
      countPerPage: 10,
    });

    const [call] = dataCalls();
    expect(call.init?.method).toBe('GET');
    expect(pathOf(call)).toBe('/api/client/status-sync');
    expect(queryOf(call).get('startTimestamp')).toBe('2026-01-01T00:00:00');
    expect(queryOf(call).get('endTimestamp')).toBe('2026-01-01T02:00:00');
    expect(queryOf(call).get('page')).toBe('3');
    expect(queryOf(call).get('countPerPage')).toBe('10');
    expect(getBody(call.init)).toBe('');
    expect(result.currentPage).toBe(1);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].statusId).toBe(1);
  });

  it('requests GET /api/client/mkt-status-sync for marketplace transitions', async () => {
    const { resource, dataCalls } = setup(() => jsonResponse({ currentPage: 1, perPage: 5, data: [] }));

    await resource.syncMarketplace({ startTimestamp: 'a', endTimestamp: 'b' });

    const [call] = dataCalls();
    expect(call.init?.method).toBe('GET');
    expect(pathOf(call)).toBe('/api/client/mkt-status-sync');
    expect(queryOf(call).get('startTimestamp')).toBe('a');
    expect(queryOf(call).get('endTimestamp')).toBe('b');
  });

  it('requests GET /api/client/xb-status-sync for cross-border transitions', async () => {
    const { resource, dataCalls } = setup(() => jsonResponse({ currentPage: 1, perPage: 5, data: [] }));

    await resource.syncCrossBorder({ startTimestamp: 'a', endTimestamp: 'b' });

    const [call] = dataCalls();
    expect(call.init?.method).toBe('GET');
    expect(pathOf(call)).toBe('/api/client/xb-status-sync');
  });

  it('requests GET /api/client/mkt-xb-status-sync for marketplace cross-border transitions', async () => {
    const { resource, dataCalls } = setup(() => jsonResponse({ currentPage: 1, perPage: 5, data: [] }));

    await resource.syncCrossBorderMarketplace({ startTimestamp: 'a', endTimestamp: 'b' });

    const [call] = dataCalls();
    expect(call.init?.method).toBe('GET');
    expect(pathOf(call)).toBe('/api/client/mkt-xb-status-sync');
  });
});

describe('StatusResource.list', () => {
  it('requests GET /api/public/status-list with name and pagination filters', async () => {
    const { resource, dataCalls } = setup(() =>
      jsonResponse({
        total: 1,
        currentPage: 2,
        pages: 2,
        perPage: 1,
        data: [{ id: 4, label: 'In transit', reasons: [{ id: 9, name: 'Absent recipient' }] }],
      }),
    );

    const page = await resource.list({ name: 'transit', page: 2, countPerPage: 1 });

    const [call] = dataCalls();
    expect(call.init?.method).toBe('GET');
    expect(pathOf(call)).toBe('/api/public/status-list');
    expect(queryOf(call).get('name')).toBe('transit');
    expect(queryOf(call).get('page')).toBe('2');
    expect(queryOf(call).get('countPerPage')).toBe('1');
    expect(page.total).toBe(1);
    expect(page.pages).toBe(2);
    expect(page.data[0].reasons[0].name).toBe('Absent recipient');
  });

  it('sends no query string when called without filters', async () => {
    const { resource, dataCalls } = setup(() =>
      jsonResponse({ total: 0, currentPage: 1, pages: 0, perPage: 500, data: [] }),
    );

    await resource.list();

    const [call] = dataCalls();
    expect(new URL(call.url).search).toBe('');
  });

  it('iterateStatuses walks every page and then stops', async () => {
    const { resource, dataCalls } = setup((call) => {
      const currentPage = Number(queryOf(call).get('page'));
      const data = currentPage === 1 ? [statusItem(1), statusItem(2)] : [statusItem(3)];
      return jsonResponse({ total: 3, currentPage, pages: 2, perPage: 2, data });
    });

    const ids: number[] = [];
    for await (const item of resource.iterateStatuses()) {
      ids.push(item.id);
    }

    expect(ids).toEqual([1, 2, 3]);
    const calls = dataCalls();
    expect(calls).toHaveLength(2);
    expect(queryOf(calls[0]).get('page')).toBe('1');
    expect(queryOf(calls[1]).get('page')).toBe('2');
    expect(queryOf(calls[0]).get('countPerPage')).toBe('500');
  });
});

describe('StatusResource.reasons', () => {
  it('requests GET /api/logistic-flow/status-reason with filters', async () => {
    const { resource, dataCalls } = setup(() =>
      jsonResponse({
        total: 1,
        currentPage: 2,
        pages: 2,
        perPage: 5,
        data: [{ id: 9, name: 'Absent recipient', status: 6 }],
      }),
    );

    const page = await resource.reasons({ name: 'absent', status: 6, page: 2, countPerPage: 5 });

    const [call] = dataCalls();
    expect(call.init?.method).toBe('GET');
    expect(pathOf(call)).toBe('/api/logistic-flow/status-reason');
    expect(queryOf(call).get('name')).toBe('absent');
    expect(queryOf(call).get('status')).toBe('6');
    expect(queryOf(call).get('page')).toBe('2');
    expect(queryOf(call).get('countPerPage')).toBe('5');
    expect(page.data[0]).toEqual({ id: 9, name: 'Absent recipient', status: 6 });
  });

  it('iterateReasons walks every page with the given countPerPage', async () => {
    const { resource, dataCalls } = setup((call) => {
      const currentPage = Number(queryOf(call).get('page'));
      const data = currentPage === 1 ? [{ id: 1, name: 'r1', status: 1 }] : [{ id: 2, name: 'r2', status: 2 }];
      return jsonResponse({ total: 2, currentPage, pages: 2, perPage: 1, data });
    });

    const ids: number[] = [];
    for await (const item of resource.iterateReasons({}, { countPerPage: 1 })) {
      ids.push(item.id);
    }

    expect(ids).toEqual([1, 2]);
    const calls = dataCalls();
    expect(calls).toHaveLength(2);
    expect(queryOf(calls[1]).get('countPerPage')).toBe('1');
    expect(queryOf(calls[1]).get('page')).toBe('2');
  });
});

describe('StatusResource.updateParcelStatus', () => {
  it('sends PUT /api/parcel/{number}/update-status with the form-encoded payload', async () => {
    const { resource, dataCalls } = setup(() =>
      jsonResponse({ success: { code: 200, message: 'Status updated' } }),
    );

    const result = await resource.updateParcelStatus('SD-123', {
      statusId: '10',
      reasonId: '5',
      pinCode: '1234',
      deliveryCheck: 1,
    });

    const [call] = dataCalls();
    expect(call.init?.method).toBe('PUT');
    expect(pathOf(call)).toBe('/api/parcel/SD-123/update-status');
    expect(getHeaders(call.init)['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(getBody(call.init)).toBe('statusId=10&reasonId=5&pinCode=1234&deliveryCheck=1');
    expect(result.success).toEqual({ code: 200, message: 'Status updated' });
  });

  it('percent-encodes the parcel number in the path', async () => {
    const { resource, dataCalls } = setup(() => jsonResponse({ success: { code: 200, message: 'ok' } }));

    await resource.updateParcelStatus('SD 12/3', { statusId: '10', damageCheck: 2 });

    const [call] = dataCalls();
    expect(pathOf(call)).toBe('/api/parcel/SD%2012%2F3/update-status');
    expect(getBody(call.init)).toBe('statusId=10&damageCheck=2');
  });
});
