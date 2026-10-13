import { describe, expect, it } from 'vitest';

import { SamedayClient } from '../src/client';
import { OohResource } from '../src/resources/ooh';
import { jsonResponse } from './helpers';

interface RecordedCall {
  url: string;
  init: RequestInit | undefined;
}

const isAuthUrl = (url: string): boolean => url.endsWith('/api/authenticate');

/** Creates an OohResource on a client wired to a routing fetch mock. */
function setup(router: (call: RecordedCall) => Response): {
  resource: OohResource;
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
    resource: new OohResource(client),
    dataCalls: () => calls.filter((call) => !isAuthUrl(call.url)),
  };
}

const pathOf = (call: RecordedCall): string => new URL(call.url).pathname;
const queryOf = (call: RecordedCall): URLSearchParams => new URL(call.url).searchParams;

function locker(lockerId: number): Record<string, unknown> {
  return {
    name: `Locker ${lockerId}`,
    country: 'Romania',
    countryId: 1,
    county: 'Bucuresti',
    countyId: 10,
    city: 'Bucuresti',
    cityId: 100,
    address: 'Str. Sample 1',
    postalCode: '010101',
    lat: 44.4,
    lng: 26.1,
    phone: '0210000000',
    email: 'locker@example.com',
    clientVisible: 1,
    lockerId,
    supportedPayment: 1,
    excludedSellers: [],
    deliveryLogisticLocationId: 3,
    deliveryLogisticLocation: 'Bucharest hub',
    occupancyLevel: 1,
    lockerRoute: 'R1',
    schedule: [{ day: 1, openingHour: '08:00', closingHour: '20:00' }],
    availableBoxes: [{ size: 'S', number: 4 }],
    reservedBoxes: [{ size: 'S', number: 1 }],
    occupiedBoxes: [{ size: 'M', number: 2 }],
  };
}

function oohLocation(oohId: number): Record<string, unknown> {
  return {
    name: `PUDO ${oohId}`,
    country: 'Romania',
    countryId: 1,
    county: 'Bucuresti',
    countyId: 10,
    city: 'Bucuresti',
    cityId: 100,
    address: 'Str. Sample 2',
    postalCode: '020202',
    lat: 44.5,
    lng: 26.2,
    phone: null,
    email: null,
    oohId,
    oohType: 1,
    oohRoute: 'R2',
    deliveryLogisticLocationId: 4,
    deliveryLogisticLocation: 'Bucharest hub 2',
    clientVisible: 1,
    capacityExceeded: 0,
    supportedPayment: 1,
    occupancyLevel: 0,
    schedule: [],
    specialSchedule: [{ day: 1, month: 1, freeDay: 1, openingHour: '', closingHour: '' }],
    photos: ['https://cdn.example.com/photo.jpg'],
  };
}

describe('OohResource.getLockers', () => {
  it('requests GET /api/client/lockers with all filters (incl. _locale)', async () => {
    const { resource, dataCalls } = setup(() =>
      jsonResponse({
        total: 1,
        currentPage: 1,
        pages: 1,
        perPage: 1,
        data: [locker(501)],
      }),
    );

    const page = await resource.getLockers({
      lockersList: '501,502',
      countryCode: 'RO',
      _locale: 'ro',
      page: 2,
      countPerPage: 25,
    });

    const [call] = dataCalls();
    expect(call.init?.method).toBe('GET');
    expect(pathOf(call)).toBe('/api/client/lockers');
    expect(queryOf(call).get('lockersList')).toBe('501,502');
    expect(queryOf(call).get('countryCode')).toBe('RO');
    expect(queryOf(call).get('_locale')).toBe('ro');
    expect(queryOf(call).get('page')).toBe('2');
    expect(queryOf(call).get('countPerPage')).toBe('25');
    expect(page.total).toBe(1);
    expect(page.data[0].lockerId).toBe(501);
    expect(page.data[0].availableBoxes[0]).toEqual({ size: 'S', number: 4 });
  });

  it('sends no query string when called without filters', async () => {
    const { resource, dataCalls } = setup(() =>
      jsonResponse({ total: 0, currentPage: 1, pages: 0, perPage: 500, data: [] }),
    );

    await resource.getLockers();

    const [call] = dataCalls();
    expect(new URL(call.url).search).toBe('');
  });

  it('iterateLockers walks pages and honors maxPages', async () => {
    const { resource, dataCalls } = setup((call) => {
      const currentPage = Number(queryOf(call).get('page'));
      const data = currentPage < 3 ? [locker(currentPage)] : [locker(999)];
      return jsonResponse({ total: 4, currentPage, pages: 4, perPage: 1, data });
    });

    const ids: number[] = [];
    for await (const item of resource.iterateLockers({ countryCode: 'RO' }, { maxPages: 2 })) {
      ids.push(item.lockerId);
    }

    expect(ids).toEqual([1, 2]);
    const calls = dataCalls();
    expect(calls).toHaveLength(2);
    expect(queryOf(calls[1]).get('page')).toBe('2');
    expect(queryOf(calls[1]).get('countryCode')).toBe('RO');
  });
});

describe('OohResource.getLocations', () => {
  it('requests GET /api/client/ooh-locations with all filters (incl. _locale)', async () => {
    const { resource, dataCalls } = setup(() =>
      jsonResponse({
        total: 1,
        currentPage: 1,
        pages: 1,
        perPage: 100,
        data: [oohLocation(9001)],
      }),
    );

    const page = await resource.getLocations({
      oohList: '9001,9002',
      listingType: 1,
      countPerPage: 100,
      countryCode: 'HU',
      _locale: 'hu',
      page: 1,
    });

    const [call] = dataCalls();
    expect(call.init?.method).toBe('GET');
    expect(pathOf(call)).toBe('/api/client/ooh-locations');
    expect(queryOf(call).get('oohList')).toBe('9001,9002');
    expect(queryOf(call).get('listingType')).toBe('1');
    expect(queryOf(call).get('countPerPage')).toBe('100');
    expect(queryOf(call).get('countryCode')).toBe('HU');
    expect(queryOf(call).get('_locale')).toBe('hu');
    expect(queryOf(call).get('page')).toBe('1');
    expect(page.data[0].oohId).toBe(9001);
    expect(page.data[0].specialSchedule[0].month).toBe(1);
  });

  it('iterateLocations walks every page and then stops', async () => {
    const { resource, dataCalls } = setup((call) => {
      const currentPage = Number(queryOf(call).get('page'));
      const data = currentPage === 1 ? [oohLocation(1), oohLocation(2)] : [oohLocation(3)];
      return jsonResponse({ total: 3, currentPage, pages: 2, perPage: 2, data });
    });

    const ids: number[] = [];
    for await (const item of resource.iterateLocations({ listingType: 0 })) {
      ids.push(item.oohId);
    }

    expect(ids).toEqual([1, 2, 3]);
    const calls = dataCalls();
    expect(calls).toHaveLength(2);
    expect(queryOf(calls[0]).get('listingType')).toBe('0');
    expect(queryOf(calls[1]).get('page')).toBe('2');
  });
});
