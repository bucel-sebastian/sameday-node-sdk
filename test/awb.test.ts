import { describe, expect, it } from 'vitest';

import { SamedayClient } from '../src/client';
import { AwbResource } from '../src/resources/awb';
import type {
  AwbParcelType2,
  AwbRecipientType,
  AwbType,
  AwbType2,
} from '../src/types';
import { getBody, getHeaders, jsonResponse } from './helpers';

interface RecordedCall {
  url: string;
  init: RequestInit | undefined;
}

/** Builds an `AwbResource` backed by a routing fetch mock (auth handled for you). */
function setup(router: (call: RecordedCall) => Response): {
  resource: AwbResource;
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
  return { resource: new AwbResource(client), calls };
}

const BASE = 'https://api.sameday.ro';

const recipient: AwbRecipientType = {
  name: 'Popescu Ion',
  phoneNumber: '0740123456',
  personType: 0,
  postalCode: '010101',
  address: 'Str. Exemplu Nr. 1',
  county: 'Bucuresti',
  city: 'Bucuresti',
  email: 'ion@example.com',
  service: 5,
};

const awbPayload: AwbType = {
  pickupPoint: '81234',
  packageType: 1,
  packageWeight: 2.4,
  service: '5',
  awbPayment: 1,
  cashOnDelivery: 149.99,
  insuredValue: 0,
  thirdPartyPickup: 0,
  awbRecipient: recipient,
  parcels: [{ weight: 1.5 }, { weight: 0.9, width: 10, length: 20, height: 5 }],
  lockerFirstMile: 0,
  lockerLastMile: 0,
  oohFirstMile: 0,
  oohLastMile: 0,
  returnLockerParcel: {},
  clientOohParcel: {},
  lockerId: 0,
  fulfillmentType: 0,
  geniusOrder: 0,
  returnAwbs: [],
};

const estimatePayload: AwbType2 = {
  pickupPoint: '81234',
  packageType: 1,
  packageWeight: 2.4,
  service: '5',
  awbPayment: 1,
  cashOnDelivery: 149.99,
  insuredValue: 0,
  thirdPartyPickup: 0,
  awbRecipient: recipient,
  parcels: [{ weight: 1.5 }],
};

/** Resource calls exclude the cached authenticate call. */
function resourceCalls(calls: RecordedCall[]): RecordedCall[] {
  return calls.filter((call) => !call.url.endsWith('/api/authenticate'));
}

describe('AwbResource', () => {
  it('create sends the form-encoded AWB payload to POST /api/awb', async () => {
    const { resource, calls } = setup(() =>
      jsonResponse({ awbNumber: 'SD-123', awbCost: 12.5 }),
    );

    const result = await resource.create(awbPayload);

    expect(result).toEqual({ awbNumber: 'SD-123', awbCost: 12.5 });
    expect(calls[0].url.endsWith('/api/authenticate')).toBe(true);
    const call = calls[1];
    expect(call.init?.method).toBe('POST');
    expect(call.url).toBe(`${BASE}/api/awb`);
    expect(getHeaders(call.init)['X-AUTH-TOKEN']).toBe('test-token');
    expect(getHeaders(call.init)['Content-Type']).toBe(
      'application/x-www-form-urlencoded',
    );
    const form = new URLSearchParams(getBody(call.init));
    expect(form.get('service')).toBe('5');
    expect(form.get('cashOnDelivery')).toBe('149.99');
    expect(form.get('awbRecipient[name]')).toBe('Popescu Ion');
    expect(form.get('awbRecipient[email]')).toBe('ion@example.com');
    expect(form.get('parcels[0][weight]')).toBe('1.5');
    expect(form.get('parcels[1][width]')).toBe('10');
    expect(getBody(call.init)).toContain('awbRecipient%5Bname%5D=');
  });

  it('estimateCost posts the estimate payload to /api/awb/estimate-cost', async () => {
    const { resource, calls } = setup(() =>
      jsonResponse({
        amount: 13.5,
        currency: 'RON',
        time: 24,
        returnAwbs: [{ awbCost: 2.5, serviceTaxId: 9 }],
      }),
    );

    const result = await resource.estimateCost(estimatePayload);

    expect(result.amount).toBe(13.5);
    expect(result.returnAwbs).toEqual([{ awbCost: 2.5, serviceTaxId: 9 }]);
    const call = calls[1];
    expect(call.init?.method).toBe('POST');
    expect(call.url).toBe(`${BASE}/api/awb/estimate-cost`);
    const form = new URLSearchParams(getBody(call.init));
    expect(form.get('awbRecipient[service]')).toBe('5');
    expect(form.get('parcels[0][weight]')).toBe('1.5');
  });

  it('estimateCostForAwbId posts with and without a payload', async () => {
    const { resource, calls } = setup(() =>
      jsonResponse({ amount: 7, currency: 'RON', time: 12 }),
    );

    const withoutPayload = await resource.estimateCostForAwbId(42);
    const withPayload = await resource.estimateCostForAwbId(42, estimatePayload);

    expect(withoutPayload.amount).toBe(7);
    expect(withPayload.amount).toBe(7);
    const bare = calls[1];
    expect(bare.init?.method).toBe('POST');
    expect(bare.url).toBe(`${BASE}/api/awb/estimate-cost/42`);
    expect(getBody(bare.init)).toBe('');
    expect(getHeaders(bare.init)['Content-Type']).toBeUndefined();
    const withBody = calls[2];
    expect(getBody(withBody.init)).not.toBe('');
    const form = new URLSearchParams(getBody(withBody.init));
    expect(form.get('cashOnDelivery')).toBe('149.99');
  });

  it('basicEstimateCost sends required query params and flattened parcels', async () => {
    const { resource, calls } = setup(() =>
      jsonResponse({ amount: 10, currency: 'RON', time: 24 }),
    );

    const result = await resource.basicEstimateCost({
      packageType: 1,
      packageWeight: 2.5,
      service: 17,
      cashOnDelivery: 0,
      insuredValue: 0,
      serviceTaxes: ['TVA1', 'TVA2'],
      deliveryInterval: 4,
      currency: 'RON',
      parcels: [
        { weight: 1, width: 10, length: 20, height: 5 },
        { weight: 2, width: 15, length: 25, height: 8, forceOversized: 1 },
      ],
    });

    expect(result).toEqual({ amount: 10, currency: 'RON', time: 24 });
    const call = calls[1];
    expect(call.init?.method).toBe('GET');
    expect(getBody(call.init)).toBe('');
    const url = new URL(call.url);
    expect(url.pathname).toBe('/api/awb/basic-estimate-cost');
    expect(url.searchParams.get('packageType')).toBe('1');
    expect(url.searchParams.get('packageWeight')).toBe('2.5');
    expect(url.searchParams.get('service')).toBe('17');
    expect(url.searchParams.get('cashOnDelivery')).toBe('0');
    expect(url.searchParams.get('insuredValue')).toBe('0');
    expect(url.searchParams.get('deliveryInterval')).toBe('4');
    expect(url.searchParams.get('currency')).toBe('RON');
    expect(url.searchParams.getAll('serviceTaxes')).toEqual(['TVA1', 'TVA2']);
    expect(url.searchParams.get('parcels[0][weight]')).toBe('1');
    expect(url.searchParams.get('parcels[0][height]')).toBe('5');
    expect(url.searchParams.get('parcels[1][forceOversized]')).toBe('1');
    expect(url.searchParams.get('packageNumber')).toBeNull();
  });

  it('getByClientReference fetches by URL-encoded reference', async () => {
    const { resource, calls } = setup(() => jsonResponse({ awbNumber: 'SD-77' }));

    const result = await resource.getByClientReference('ORD 99');

    expect(result.awbNumber).toBe('SD-77');
    const call = calls[1];
    expect(call.init?.method).toBe('GET');
    expect(call.url).toBe(`${BASE}/api/client/awb/ORD%2099`);
  });

  it('cancel deletes the AWB with an optional form body', async () => {
    const { resource, calls } = setup(() => new Response(null, { status: 204 }));

    await expect(resource.cancel('SD-123', { reason: 'test' })).resolves.toBeUndefined();
    const call = calls[1];
    expect(call.init?.method).toBe('DELETE');
    expect(call.url).toBe(`${BASE}/api/awb/SD-123`);
    expect(getBody(call.init)).toBe('reason=test');
  });

  it('addParcel posts the parcel form to POST /api/awb/{awbNumber}/parcel', async () => {
    const { resource, calls } = setup(() =>
      jsonResponse({ awbParcelNumber: 'P-1' }, 201),
    );
    const payload: AwbParcelType2 = { weight: 1.2, position: 1 };

    const result = await resource.addParcel('SD-123', payload);

    expect(result.awbParcelNumber).toBe('P-1');
    const call = calls[1];
    expect(call.init?.method).toBe('POST');
    expect(call.url).toBe(`${BASE}/api/awb/SD-123/parcel`);
    const form = new URLSearchParams(getBody(call.init));
    expect(form.get('weight')).toBe('1.2');
    expect(form.get('position')).toBe('1');
  });

  it('updateCod puts the new cash-on-delivery', async () => {
    const { resource, calls } = setup(() =>
      jsonResponse({ success: { code: 200, message: 'ok' } }, 201),
    );

    const result = await resource.updateCod('SD-123', { cashOnDelivery: 99.5 });

    expect(result.success).toEqual({ code: 200, message: 'ok' });
    const call = calls[1];
    expect(call.init?.method).toBe('PUT');
    expect(call.url).toBe(`${BASE}/api/awb/SD-123/update-cod`);
    expect(getBody(call.init)).toBe('cashOnDelivery=99.5');
  });

  it('activateStandbyReturn patches the approve query flag', async () => {
    const { resource, calls } = setup(() => new Response(null, { status: 204 }));

    await resource.activateStandbyReturn('SD-123', 1);
    await resource.activateStandbyReturn('SD-123', 0);

    const first = calls[1];
    expect(first.init?.method).toBe('PATCH');
    expect(new URL(first.url).pathname).toBe('/api/awb/SD-123/standby');
    expect(new URL(first.url).searchParams.get('approve')).toBe('1');
    expect(new URL(calls[2].url).searchParams.get('approve')).toBe('0');
  });

  it('list forwards filters as query parameters', async () => {
    const { resource, calls } = setup(() =>
      jsonResponse({
        total: 1,
        currentPage: 2,
        pages: 3,
        perPage: 25,
        data: [{ awbNumber: 'SD-1', isPrinted: false }],
      }),
    );

    const result = await resource.list({
      page: 2,
      countPerPage: 25,
      startTimestamp: '2026-01-01T00:00:00',
      endTimestamp: '2026-01-01T23:59:59',
      isPrinted: 0,
    });

    expect(result.total).toBe(1);
    expect(result.data).toHaveLength(1);
    const url = new URL(calls[1].url);
    expect(url.pathname).toBe('/api/client-awb-list');
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('countPerPage')).toBe('25');
    expect(url.searchParams.get('startTimestamp')).toBe('2026-01-01T00:00:00');
    expect(url.searchParams.get('endTimestamp')).toBe('2026-01-01T23:59:59');
    expect(url.searchParams.get('isPrinted')).toBe('0');
  });

  it('list with no filters sends no query string', async () => {
    const { resource, calls } = setup(() =>
      jsonResponse({ total: 0, currentPage: 1, pages: 0, perPage: 500, data: [] }),
    );

    const result = await resource.list();

    expect(result.data).toEqual([]);
    expect(calls[1].url).toBe(`${BASE}/api/client-awb-list`);
  });

  it('iterate walks pages until exhausted and forwards filters', async () => {
    const { resource, calls } = setup((call) => {
      const page = new URL(call.url).searchParams.get('page') ?? '1';
      if (page === '1') {
        return jsonResponse({
          total: 3,
          currentPage: 1,
          pages: 2,
          perPage: 2,
          data: [{ awbNumber: 'SD-1' }, { awbNumber: 'SD-2' }],
        });
      }
      return jsonResponse({
        total: 3,
        currentPage: 2,
        pages: 2,
        perPage: 2,
        data: [{ awbNumber: 'SD-3' }],
      });
    });

    const seen: string[] = [];
    for await (const item of resource.iterate({ startTimestamp: '2026-01-01T00:00:00' })) {
      seen.push(item.awbNumber ?? '');
    }

    expect(seen).toEqual(['SD-1', 'SD-2', 'SD-3']);
    const fetched = resourceCalls(calls);
    expect(fetched).toHaveLength(2);
    expect(new URL(fetched[0].url).searchParams.get('startTimestamp')).toBe(
      '2026-01-01T00:00:00',
    );
    expect(new URL(fetched[1].url).searchParams.get('page')).toBe('2');
    expect(new URL(fetched[1].url).searchParams.get('countPerPage')).toBe('500');
  });

  it('iterate stops after an early break without fetching more pages', async () => {
    const { resource, calls } = setup(() =>
      jsonResponse({
        total: 10,
        currentPage: 1,
        pages: 5,
        perPage: 1,
        data: [{ awbNumber: 'SD-1' }],
      }),
    );

    const seen: string[] = [];
    for await (const item of resource.iterate()) {
      seen.push(item.awbNumber ?? '');
      break;
    }

    expect(seen).toEqual(['SD-1']);
    expect(resourceCalls(calls)).toHaveLength(1);
  });

  it('downloadLabel fetches a binary label with default path segments', async () => {
    const { resource, calls } = setup(
      () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
    );

    const buffer = await resource.downloadLabel('SD-9');

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect([...buffer]).toEqual([1, 2, 3]);
    const call = calls[1];
    expect(call.init?.method).toBe('GET');
    expect(new URL(call.url).pathname).toBe('/api/awb/download/SD-9/A4/pdf/inline');
    expect(getBody(call.init)).toBe('');
  });

  it('downloadLabel honours format, contentType, disposition and resolution', async () => {
    const { resource, calls } = setup(
      () => new Response(new Uint8Array([9]), { status: 200 }),
    );

    await resource.downloadLabel('SD-9', {
      format: 'A6',
      contentType: 'zpl',
      disposition: 'attachment',
      resolution: 300,
    });

    const url = new URL(calls[1].url);
    expect(url.pathname).toBe('/api/awb/download/SD-9/A6/zpl/attachment');
    expect(url.searchParams.get('resolution')).toBe('300');
  });

  it('downloadStandbyReturnLabel uses the standby path with html allowed', async () => {
    const { resource, calls } = setup(
      () => new Response(new Uint8Array([7]), { status: 200 }),
    );

    const buffer = await resource.downloadStandbyReturnLabel('SD-9', {
      contentType: 'html',
    });

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(new URL(calls[1].url).pathname).toBe(
      '/api/awb/download-standby-return/SD-9/A4/html/inline',
    );
  });

  it('downloadProofOfDelivery fetches the POD document', async () => {
    const { resource, calls } = setup(
      () => new Response(new Uint8Array([4, 5]), { status: 200 }),
    );

    const buffer = await resource.downloadProofOfDelivery('SD-9', {
      disposition: 'attachment',
    });

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(new URL(calls[1].url).pathname).toBe('/api/awb/SD-9/proof-of-delivery/attachment');
  });
});
