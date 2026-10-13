import { describe, expect, it } from 'vitest';

import { SamedayClient } from '../src/client';
import { ServicesResource } from '../src/resources/services';
import { jsonResponse } from './helpers';

interface RecordedCall {
  url: string;
  init: RequestInit | undefined;
}

/** Builds a `ServicesResource` backed by a routing fetch mock. */
function setup(router: (call: RecordedCall) => Response): {
  resource: ServicesResource;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const call: RecordedCall = { url: String(input), init };
    calls.push(call);
    if (call.url.endsWith('/api/authenticate')) {
      const expire = new Date(Date.now() + 3_600_000).toISOString();
      return jsonResponse({
        token: 'test-token',
        expire_at: expire,
        expire_at_utc: expire,
      });
    }
    return router(call);
  };
  const client = new SamedayClient({ user: 'demo-user', password: 'demo-pass', fetchImpl });
  return { resource: new ServicesResource(client), calls };
}

const BASE = 'https://api.sameday.ro';

const servicePage = (data: unknown[], currentPage: number, pages: number): Response =>
  jsonResponse({ total: pages, currentPage, pages, perPage: data.length, data });

function resourceCalls(calls: RecordedCall[]): RecordedCall[] {
  return calls.filter((call) => !call.url.endsWith('/api/authenticate'));
}

describe('ServicesResource', () => {
  it('list with no filters sends no query string and no body', async () => {
    const { resource, calls } = setup(() =>
      servicePage(
        [
          {
            id: 5,
            name: 'Courier 24h',
            serviceCode: 'C24',
            deliveryType: { id: 1, name: 'Home delivery' },
            defaultService: true,
            serviceOptionalTaxes: [{ id: 9, name: 'TVA', tax: 19, packageType: 1 }],
          },
        ],
        1,
        1,
      ),
    );

    const result = await resource.list();

    expect(result.data[0].name).toBe('Courier 24h');
    expect(result.data[0].deliveryType?.name).toBe('Home delivery');
    expect(result.data[0].serviceOptionalTaxes?.[0].tax).toBe(19);
    const call = calls[1];
    expect(call.init?.method).toBe('GET');
    expect(call.url).toBe(`${BASE}/api/client/services`);
    // Fetch forbids bodies on GET — the SDK must not send one.
    expect(call.init?.body).toBeUndefined();
  });

  it('list sends pagination in the query string (GET cannot carry a body)', async () => {
    const { resource, calls } = setup(() => servicePage([], 1, 0));

    await resource.list({ page: 2, countPerPage: 10 });

    const call = calls[1];
    const url = new URL(call.url);
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('countPerPage')).toBe('10');
    expect(call.init?.body).toBeUndefined();
  });

  it('iterate walks pages via the query string until exhausted', async () => {
    const { resource, calls } = setup((call) => {
      const page = new URL(call.url).searchParams.get('page') ?? '1';
      if (page === '1') {
        return servicePage(
          [{ id: 5, name: 'Courier 24h' }, { id: 6, name: 'Courier 48h' }],
          1,
          2,
        );
      }
      return servicePage([{ id: 7, name: 'Locker 24h' }], 2, 2);
    });

    const seen: string[] = [];
    for await (const service of resource.iterate()) {
      seen.push(service.name ?? '');
    }

    expect(seen).toEqual(['Courier 24h', 'Courier 48h', 'Locker 24h']);
    const fetched = resourceCalls(calls);
    expect(fetched).toHaveLength(2);
    expect(new URL(fetched[0].url).searchParams.get('page')).toBe('1');
    expect(new URL(fetched[1].url).searchParams.get('page')).toBe('2');
    expect(new URL(fetched[1].url).searchParams.get('countPerPage')).toBe('500');
  });

  it('iterate stops after an early break without fetching more pages', async () => {
    const { resource, calls } = setup(() =>
      servicePage([{ id: 5, name: 'Courier 24h' }], 1, 5),
    );

    const seen: string[] = [];
    for await (const service of resource.iterate()) {
      seen.push(service.name ?? '');
      break;
    }

    expect(seen).toEqual(['Courier 24h']);
    expect(resourceCalls(calls)).toHaveLength(1);
  });
});
