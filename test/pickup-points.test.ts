import { describe, expect, it } from 'vitest';

import { SamedayClient } from '../src/client';
import { PickupPointsResource } from '../src/resources/pickup-points';
import type {
  ContactPersonType,
  NonMandatoryPickupPointType,
  PickupPointType,
} from '../src/types';
import { getBody, getHeaders, jsonResponse } from './helpers';

interface RecordedCall {
  url: string;
  init: RequestInit | undefined;
}

/** Builds a `PickupPointsResource` backed by a routing fetch mock. */
function setup(router: (call: RecordedCall) => Response): {
  resource: PickupPointsResource;
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
  return { resource: new PickupPointsResource(client), calls };
}

const BASE = 'https://api.sameday.ro';

const createPayload: PickupPointType = {
  country: 'RO',
  county: '27',
  city: '12345',
  address: 'Str. Exemplu Nr. 10',
  postalCode: '010101',
  alias: 'Depozit Central',
  cutOff: '17:00',
  deliveryInterval: 'next-day',
  defaultPickupPoint: 0,
  pickupPointContactPerson: [
    {
      name: 'Ionescu Maria',
      phoneNumber: '0740123456',
      email: 'maria@example.com',
      position: 'Manager',
      defaultContactPerson: 1,
    },
  ],
};

const editPayload: NonMandatoryPickupPointType = {
  alias: 'Depozit Central 2',
  deliveryInterval: 'same-day',
  status: 1,
};

const contactPayload: ContactPersonType = {
  name: 'Popa Andrei',
  phoneNumber: '0740654321',
  email: 'andrei@example.com',
  position: 'Operator',
  defaultContactPerson: 0,
};

function resourceCalls(calls: RecordedCall[]): RecordedCall[] {
  return calls.filter((call) => !call.url.endsWith('/api/authenticate'));
}

describe('PickupPointsResource', () => {
  it('list with no filters sends no query string', async () => {
    const { resource, calls } = setup(() =>
      jsonResponse({
        total: 1,
        currentPage: 1,
        pages: 1,
        perPage: 500,
        data: [{ id: 7, alias: 'Depozit Central', status: true }],
      }),
    );

    const result = await resource.list();

    expect(result.total).toBe(1);
    expect(result.data[0].alias).toBe('Depozit Central');
    expect(calls[1].url).toBe(`${BASE}/api/client/pickup-points`);
    expect(calls[1].init?.method).toBe('GET');
  });

  it('list forwards pagination as query parameters', async () => {
    const { resource, calls } = setup(() =>
      jsonResponse({ total: 0, currentPage: 1, pages: 0, perPage: 10, data: [] }),
    );

    await resource.list({ page: 3, countPerPage: 10 });

    const url = new URL(calls[1].url);
    expect(url.pathname).toBe('/api/client/pickup-points');
    expect(url.searchParams.get('page')).toBe('3');
    expect(url.searchParams.get('countPerPage')).toBe('10');
  });

  it('iterate walks pages until exhausted', async () => {
    const { resource, calls } = setup((call) => {
      const page = new URL(call.url).searchParams.get('page') ?? '1';
      if (page === '1') {
        return jsonResponse({
          total: 3,
          currentPage: 1,
          pages: 2,
          perPage: 2,
          data: [{ id: 1, alias: 'PP One' }, { id: 2, alias: 'PP Two' }],
        });
      }
      return jsonResponse({
        total: 3,
        currentPage: 2,
        pages: 2,
        perPage: 2,
        data: [{ id: 3, alias: 'PP Three' }],
      });
    });

    const seen: string[] = [];
    for await (const point of resource.iterate()) {
      seen.push(point.alias ?? '');
    }

    expect(seen).toEqual(['PP One', 'PP Two', 'PP Three']);
    const fetched = resourceCalls(calls);
    expect(fetched).toHaveLength(2);
    expect(new URL(fetched[0].url).searchParams.get('page')).toBe('1');
    expect(new URL(fetched[0].url).searchParams.get('countPerPage')).toBe('500');
    expect(new URL(fetched[1].url).searchParams.get('page')).toBe('2');
  });

  it('iterate stops after an early break without fetching more pages', async () => {
    const { resource, calls } = setup(() =>
      jsonResponse({
        total: 10,
        currentPage: 1,
        pages: 5,
        perPage: 1,
        data: [{ id: 1, alias: 'PP One' }],
      }),
    );

    const seen: string[] = [];
    for await (const point of resource.iterate()) {
      seen.push(point.alias ?? '');
      break;
    }

    expect(seen).toEqual(['PP One']);
    expect(resourceCalls(calls)).toHaveLength(1);
  });

  it('create posts the form-encoded payload to POST /api/client/pickup-points', async () => {
    const { resource, calls } = setup(() =>
      jsonResponse(
        { id: 42, contact_persons: { id: 5, name: 'Ionescu Maria', code: 'CP-5' } },
        201,
      ),
    );

    const result = await resource.create(createPayload);

    expect(result.id).toBe(42);
    expect(result.contact_persons).toEqual({ id: 5, name: 'Ionescu Maria', code: 'CP-5' });
    const call = calls[1];
    expect(call.init?.method).toBe('POST');
    expect(call.url).toBe(`${BASE}/api/client/pickup-points`);
    expect(getHeaders(call.init)['Content-Type']).toBe(
      'application/x-www-form-urlencoded',
    );
    const form = new URLSearchParams(getBody(call.init));
    expect(form.get('county')).toBe('27');
    expect(form.get('alias')).toBe('Depozit Central');
    expect(form.get('pickupPointContactPerson[0][name]')).toBe('Ionescu Maria');
    expect(form.get('pickupPointContactPerson[0][email]')).toBe('maria@example.com');
    expect(form.get('pickupPointContactPerson[0][defaultContactPerson]')).toBe('1');
  });

  it('edit patches the pickup point by string id and returns 204', async () => {
    const { resource, calls } = setup(() => new Response(null, { status: 204 }));

    await expect(resource.edit('81234', editPayload)).resolves.toBeUndefined();

    const call = calls[1];
    expect(call.init?.method).toBe('PATCH');
    expect(call.url).toBe(`${BASE}/api/client/pickup-points/81234`);
    const form = new URLSearchParams(getBody(call.init));
    expect(form.get('alias')).toBe('Depozit Central 2');
    expect(form.get('status')).toBe('1');
  });

  it('delete removes the pickup point by numeric id and returns 204', async () => {
    const { resource, calls } = setup(() => new Response(null, { status: 204 }));

    await expect(resource.delete(7)).resolves.toBeUndefined();

    const call = calls[1];
    expect(call.init?.method).toBe('DELETE');
    expect(call.url).toBe(`${BASE}/api/client/pickup-points/7`);
  });

  it('addContactPerson posts to /contact-person and returns 201', async () => {
    const { resource, calls } = setup(() => jsonResponse({ id: 9 }, 201));

    const result = await resource.addContactPerson(7, contactPayload);

    expect(result.id).toBe(9);
    const call = calls[1];
    expect(call.init?.method).toBe('POST');
    expect(call.url).toBe(`${BASE}/api/client/pickup-points/7/contact-person`);
    const form = new URLSearchParams(getBody(call.init));
    expect(form.get('name')).toBe('Popa Andrei');
    expect(form.get('phoneNumber')).toBe('0740654321');
    expect(form.get('defaultContactPerson')).toBe('0');
  });
});
