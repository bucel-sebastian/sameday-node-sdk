import { describe, expect, it } from 'vitest';

import { SamedayClient } from '../src/client';
import { GeolocationResource } from '../src/resources/geolocation';
import { jsonResponse } from './helpers';

interface RecordedCall {
  url: string;
  init: RequestInit | undefined;
}

/** Builds a `GeolocationResource` backed by a routing fetch mock. */
function setup(router: (call: RecordedCall) => Response): {
  resource: GeolocationResource;
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
  return { resource: new GeolocationResource(client), calls };
}

const BASE = 'https://api.sameday.ro';

const cityPage = (data: unknown[], currentPage: number, pages: number): Response =>
  jsonResponse({ total: pages, currentPage, pages, perPage: data.length, data });

function resourceCalls(calls: RecordedCall[]): RecordedCall[] {
  return calls.filter((call) => !call.url.endsWith('/api/authenticate'));
}

describe('GeolocationResource', () => {
  it('cities with no filters sends no query string', async () => {
    const { resource, calls } = setup(() =>
      cityPage([{ id: 1, name: 'Bucuresti', county: { id: 27, name: 'Bucuresti', code: 'B' } }], 1, 1),
    );

    const result = await resource.cities();

    expect(result.data).toHaveLength(1);
    expect(result.data[0].name).toBe('Bucuresti');
    expect(result.data[0].county?.code).toBe('B');
    expect(calls[1].url).toBe(`${BASE}/api/geolocation/city`);
    expect(calls[1].init?.method).toBe('GET');
  });

  it('cities forwards all supported filters as query parameters', async () => {
    const { resource, calls } = setup(() => cityPage([], 1, 0));

    await resource.cities({
      name: 'Cluj',
      county: 'Cluj',
      postalCode: '400001',
      countryCode: 'RO',
      details: true,
      page: 2,
      countPerPage: 50,
    });

    const url = new URL(calls[1].url);
    expect(url.pathname).toBe('/api/geolocation/city');
    expect(url.searchParams.get('name')).toBe('Cluj');
    expect(url.searchParams.get('county')).toBe('Cluj');
    expect(url.searchParams.get('postalCode')).toBe('400001');
    expect(url.searchParams.get('countryCode')).toBe('RO');
    expect(url.searchParams.get('details')).toBe('true');
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('countPerPage')).toBe('50');
  });

  it('iterateCities walks pages and forwards filters on each page', async () => {
    const { resource, calls } = setup((call) => {
      const page = new URL(call.url).searchParams.get('page') ?? '1';
      if (page === '1') {
        return cityPage([{ id: 1, name: 'Bucuresti' }, { id: 2, name: 'Brașov' }], 1, 2);
      }
      return cityPage([{ id: 3, name: 'Cluj-Napoca' }], 2, 2);
    });

    const seen: string[] = [];
    for await (const city of resource.iterateCities({ countryCode: 'RO' })) {
      seen.push(city.name ?? '');
    }

    expect(seen).toEqual(['Bucuresti', 'Brașov', 'Cluj-Napoca']);
    const fetched = resourceCalls(calls);
    expect(fetched).toHaveLength(2);
    expect(new URL(fetched[0].url).searchParams.get('countryCode')).toBe('RO');
    expect(new URL(fetched[0].url).searchParams.get('countPerPage')).toBe('500');
    expect(new URL(fetched[1].url).searchParams.get('page')).toBe('2');
    expect(new URL(fetched[1].url).searchParams.get('countryCode')).toBe('RO');
  });

  it('iterateCities stops after an early break without fetching more pages', async () => {
    const { resource, calls } = setup(() =>
      cityPage([{ id: 1, name: 'Bucuresti' }], 1, 5),
    );

    const seen: string[] = [];
    for await (const city of resource.iterateCities()) {
      seen.push(city.name ?? '');
      break;
    }

    expect(seen).toEqual(['Bucuresti']);
    expect(resourceCalls(calls)).toHaveLength(1);
  });

  it('counties with no filters sends no query string', async () => {
    const { resource, calls } = setup(() =>
      jsonResponse({
        total: 1,
        currentPage: 1,
        pages: 1,
        perPage: 1,
        data: [{ id: 27, name: 'Bucuresti', code: 'B', countryId: 2, country: 'Romania' }],
      }),
    );

    const result = await resource.counties();

    expect(result.data[0].name).toBe('Bucuresti');
    expect(result.data[0].code).toBe('B');
    expect(calls[1].url).toBe(`${BASE}/api/geolocation/county`);
  });

  it('counties forwards filters and pagination as query parameters', async () => {
    const { resource, calls } = setup(() => cityPage([], 1, 0));

    await resource.counties({ name: 'Cluj', countryCode: 'RO', page: 4, countPerPage: 20 });

    const url = new URL(calls[1].url);
    expect(url.pathname).toBe('/api/geolocation/county');
    expect(url.searchParams.get('name')).toBe('Cluj');
    expect(url.searchParams.get('countryCode')).toBe('RO');
    expect(url.searchParams.get('page')).toBe('4');
    expect(url.searchParams.get('countPerPage')).toBe('20');
  });

  it('iterateCounties stops after a single page when the API reports one', async () => {
    const { resource, calls } = setup(() =>
      jsonResponse({
        total: 1,
        currentPage: 1,
        pages: 1,
        perPage: 500,
        data: [{ id: 27, name: 'Bucuresti', code: 'B' }],
      }),
    );

    const seen: string[] = [];
    for await (const county of resource.iterateCounties()) {
      seen.push(county.name ?? '');
    }

    expect(seen).toEqual(['Bucuresti']);
    expect(resourceCalls(calls)).toHaveLength(1);
  });
});
