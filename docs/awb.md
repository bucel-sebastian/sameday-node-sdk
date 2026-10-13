# AWB lifecycle

Everything under `client.awb` (`AwbResource`) — creating waybills, price
estimates, mutations, listing and document downloads. See the generated
[API reference](api/index.html) for the full option types.

## Method map

| Method | API endpoint |
|---|---|
| `create(payload)` | `POST /api/awb` |
| `estimateCost(payload)` | `POST /api/awb/estimate-cost` |
| `estimateCostForAwbId(awbId, payload?)` | `POST /api/awb/estimate-cost/{awbId}` |
| `basicEstimateCost(params)` | `GET /api/awb/basic-estimate-cost` |
| `getByClientReference(ref)` | `GET /api/client/awb/{ref}` |
| `cancel(awbOrParcelNumber, body?)` | `DELETE /api/awb/{awbOrParcelNumber}` |
| `addParcel(awbNumber, payload)` | `POST /api/awb/{awbNumber}/parcel` |
| `updateCod(awbNumber, payload)` | `PUT /api/awb/{awbNumber}/update-cod` |
| `activateStandbyReturn(awbNumber, approve, body?)` | `PATCH /api/awb/{awbNumber}/standby?approve=...` |
| `list(filters?)` | `GET /api/client-awb-list` |
| `iterate(filters?, options?)` | walks `list` across pages |
| `downloadLabel(awbNumber, options?)` | `GET /api/awb/download/{awb}/{format}/{contentType}/{disposition}` |
| `downloadStandbyReturnLabel(awbNumber, options?)` | `GET /api/awb/download-standby-return/...` |
| `downloadProofOfDelivery(awbNumber, options?)` | `GET /api/awb/{awb}/proof-of-delivery/{disposition}` |

> UIT codes are **not** on this resource: reading UIT-code sync data and saving
> a parcel's UIT code live on `client.uitCodes` (`sync()`, `saveUitCode()`).

## Create an AWB

The payload is a plain nested JavaScript object (`AwbType`). The SDK posts it
as `application/x-www-form-urlencoded` using PHP-style bracket notation —
`awbRecipient[name]=...`, `parcels[0][weight]=...` — so you never touch the
wire format:

```ts
const awb = await client.awb.create({
  pickupPoint: '81234',          // client pickup-point id
  packageType: 1,                // 0 package, 1 small package, 2 large package
  packageWeight: 2.4,            // total weight, kg
  service: '5',                  // service id from client.services.list()
  awbPayment: 1,                 // 1 = client pays
  cashOnDelivery: 149.99,        // 0 when no COD
  insuredValue: 0,
  thirdPartyPickup: 0,           // 1 = pickup from a third party (thirdParty required then)
  clientInternalReference: 'order-1042', // shown in the COD ledger
  awbRecipient: {
    name: 'Popescu Ion',
    phoneNumber: '0740123456',
    personType: 0,               // 0 natural person, 1 company
    postalCode: '010101',
    address: 'Str. Exemplu Nr. 1',
    county: 'Bucuresti',
    city: 'Bucuresti',
    email: 'ion@example.com',
    service: 5,                  // numeric id, same service
  },
  parcels: [
    { weight: 1.5, length: 20, width: 10, height: 5 },
    { weight: 0.9 },             // weight is the only required parcel field
  ],
  // Fields the AwbType interface requires but most integrations leave at 0:
  lockerFirstMile: 0,
  lockerLastMile: 0,
  oohFirstMile: 0,
  oohLastMile: 0,
  lockerId: 0,
  fulfillmentType: 0,
  geniusOrder: 0,
  returnLockerParcel: {},
  clientOohParcel: {},
  returnAwbs: [],
});

console.log(awb.awbNumber);      // e.g. 'SD-123456789'
console.log(awb.awbCost);        // charged cost when present
```

On the wire the nested parts become:

```text
awbRecipient[name]=Popescu+Ion&parcels[0][weight]=1.5&parcels[1][weight]=0.9...
```

`undefined`/`null` fields are stripped before sending, so you can pass optional
blocks unconditionally.

## Price estimates

Three flavours:

```ts
import type { AwbType2 } from 'sameday-node-sdk';

// 1. Full AWB payload (same nesting as create)
const payload: AwbType2 = {
  pickupPoint: '81234',
  packageType: 1,
  packageWeight: 2.4,
  service: '5',
  awbPayment: 1,
  cashOnDelivery: 149.99,
  insuredValue: 0,
  thirdPartyPickup: 0,
  awbRecipient: { /* same as above */ },
  parcels: [{ weight: 1.5 }],
};
const quote = await client.awb.estimateCost(payload);

console.log(quote.amount, quote.currency, quote.time); // quote.returnAwbs[] breaks down return costs

// 2. Estimate for an AWB that already exists (no payload => from the database)
const existing = await client.awb.estimateCostForAwbId(42);

// 3. C2C quick estimate (GET, parcels flattened to parcels[i][field] query keys)
const c2c = await client.awb.basicEstimateCost({
  packageType: 1,      // 0 package, 1 small, 2 large
  packageWeight: 2.5,
  service: 17,
  cashOnDelivery: 0,
  insuredValue: 0,
  parcels: [{ weight: 1, width: 10, length: 20, height: 5 }],
  // packageNumber?, serviceTaxes?, deliveryInterval?, currency?
});
```

`basicEstimateCost` is a `GET` request; per the Fetch standard GETs cannot
carry bodies, so the SDK serializes the parcels as flattened query keys
(`parcels[0][weight]=1`), which the API accepts.

## Fetch, cancel, mutate

```ts
// By your own internal reference (invoice number, order id, ...)
const awb = await client.awb.getByClientReference('order-1042');

// Cancel by AWB or parcel number (resolves to void on 204)
await client.awb.cancel(awb.awbNumber!);

// Add a parcel (position is required by AwbParcelType2)
await client.awb.addParcel('SD-123456789', { weight: 1.2, position: 2 });

// Change the cash-on-delivery amount
await client.awb.updateCod('SD-123456789', { cashOnDelivery: 99.99 });

// Approve (1) or reject (0) a standby return
await client.awb.activateStandbyReturn('SD-123456789', 1);
```

## List and iterate

`list()` returns one page of `Paginated<ClientAwbListItem>` (`GET
/api/client-awb-list`). The API allows **max 24 hours** between
`startTimestamp`/`endTimestamp`:

```ts
const page = await client.awb.list({
  startTimestamp: '2026-01-01 00:00:00',
  endTimestamp: '2026-01-01 23:59:59',
  isPrinted: 0,        // 0 not printed, 1 printed (optional)
  page: 1,
  countPerPage: 100,
});

console.log(page.total, page.pages, page.data[0]?.awbNumber);
```

`iterate()` walks every page for you (see [Pagination](pagination.md)):

```ts
for await (const row of client.awb.iterate({
  startTimestamp: '2026-01-01 00:00:00',
  endTimestamp: '2026-01-01 23:59:59',
})) {
  console.log(row.awbNumber, row.awbStatus, row.cashOnDelivery);
}
```

## Download documents

Labels, standby-return documents, proofs of delivery and ledgers return a
Node `Buffer` (never JSON). Write it to disk with `node:fs`:

```ts
import { writeFile } from 'node:fs/promises';

const label = await client.awb.downloadLabel('SD-123456789', {
  format: 'A4',        // 'A4' | 'A6'        (default 'A4')
  contentType: 'pdf',  // 'pdf' | 'html' | 'zpl' (default 'pdf')
  disposition: 'inline', // 'inline' | 'attachment' (default 'inline')
  resolution: 203,     // optional, for zpl
});
await writeFile('label.pdf', label);

const returnDoc = await client.awb.downloadStandbyReturnLabel('SD-123456789', {
  format: 'A6',        // 'A4' | 'A6'; contentType 'pdf' | 'html'
});
await writeFile('standby-return.pdf', returnDoc);

const pod = await client.awb.downloadProofOfDelivery('SD-123456789', {
  disposition: 'attachment', // default 'inline'
});
await writeFile('pod.pdf', pod);
```

Cash-on-delivery ledger exports (CSV) live on `client.ledger` — see the
[API reference](api/index.html).
