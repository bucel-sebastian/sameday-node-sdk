import { describe, expect, it } from 'vitest';

import { SamedayClient } from '../src/client';
import {
  AwbResource,
  GeolocationResource,
  LedgerResource,
  OohResource,
  PickupPointsResource,
  ServicesResource,
  StandbyReturnsResource,
  StatusResource,
  UitCodesResource,
} from '../src/index';
import { jsonResponse } from './helpers';

/** Every public namespace with the resource class it must be an instance of. */
const NAMESPACES = [
  ['awb', AwbResource],
  ['pickupPoints', PickupPointsResource],
  ['geolocation', GeolocationResource],
  ['services', ServicesResource],
  ['status', StatusResource],
  ['ooh', OohResource],
  ['ledger', LedgerResource],
  ['standbyReturns', StandbyReturnsResource],
  ['uitCodes', UitCodesResource],
] as const;

describe('SamedayClient resource namespaces', () => {
  it('exposes all nine namespaces as instances of their resource classes', () => {
    const client = new SamedayClient({ user: 'demo-user', password: 'demo-pass' });

    for (const [namespace, ResourceClass] of NAMESPACES) {
      expect(client[namespace]).toBeInstanceOf(ResourceClass);
    }
  });

  it('constructs distinct namespace instances per client', () => {
    const first = new SamedayClient({ user: 'demo-user', password: 'demo-pass' });
    const second = new SamedayClient({ user: 'demo-user', password: 'demo-pass' });

    const values = NAMESPACES.map(([namespace]) => first[namespace]);
    expect(new Set(values).size).toBe(NAMESPACES.length);
    expect(second.awb).not.toBe(first.awb);
    expect(second.uitCodes).not.toBe(first.uitCodes);
  });

  it('routes namespace calls through the owning client (auth + request pipeline)', async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith('/api/authenticate')) {
        return jsonResponse({
          token: 'ns-token',
          expire_at: '2100-01-01T00:00:00.000Z',
          expire_at_utc: '2100-01-01T00:00:00.000Z',
        });
      }
      return jsonResponse({ total: 0, currentPage: 1, pages: 0, perPage: 1, data: [] });
    };
    const client = new SamedayClient({ user: 'demo-user', password: 'demo-pass', fetchImpl });

    const result = await client.pickupPoints.list();

    expect(result.data).toEqual([]);
    expect(calls).toHaveLength(2);
    expect(calls[0].endsWith('/api/authenticate')).toBe(true);
    expect(calls[1]).toContain('/api/client/pickup-points');
  });
});
