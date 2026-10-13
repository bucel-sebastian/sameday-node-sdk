# sameday-node-sdk

[![npm version](https://img.shields.io/npm/v/sameday-node-sdk.svg)](https://www.npmjs.com/package/sameday-node-sdk)
[![CI](https://github.com/bucel-sebastian/sameday-node-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/bucel-sebastian/sameday-node-sdk/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/npm/l/sameday-node-sdk.svg)](https://opensource.org/license/mit)

TypeScript/JavaScript client for the Sameday courier API (Romania): 36 endpoints across AWBs, pickup points, geolocation, status sync, lockers/OOH, COD ledgers, standby returns and UIT codes. Zero runtime dependencies, native `fetch`, dual ESM + CJS builds.

## Installation

```bash
npm install sameday-node-sdk
```

Requires **Node.js >= 18** (the SDK uses the built-in `fetch`).

## Quickstart

Create a client once and reuse it. `environment` defaults to `'prod'`; pass `'demo'` to hit the demo API. `platformName`/`platformVersion` are combined into the `X-Platform: name/version` header the API uses to identify integrations.

```ts
import { SamedayClient } from 'sameday-node-sdk';

const client = new SamedayClient({
  user: process.env.SAMEDAY_USER!,
  password: process.env.SAMEDAY_PASSWORD!,
  environment: 'demo',          // 'prod' (default) | 'demo'
  platformName: 'my-shop',      // sent as X-Platform: my-shop/1.0.0
  platformVersion: '1.0.0',
});
```

The client authenticates lazily on the first request, caches the token, and re-authenticates once on a 401 — you never handle tokens yourself. All endpoints live on namespaces: `client.awb`, `client.pickupPoints`, `client.geolocation`, `client.services`, `client.status`, `client.ooh`, `client.ledger`, `client.standbyReturns`, `client.uitCodes`.

### Create an AWB

The payload is a plain nested JavaScript object; the SDK sends it as `application/x-www-form-urlencoded` with bracket notation (`awbRecipient[name]=...`, `parcels[0][weight]=...`) for you.

```ts
const awb = await client.awb.create({
  pickupPoint: '81234',
  packageType: 1,              // 0 package, 1 small package, 2 large package
  packageWeight: 2.4,          // kg
  service: '5',                // id from client.services.list()
  awbPayment: 1,
  cashOnDelivery: 149.99,
  insuredValue: 0,
  thirdPartyPickup: 0,
  clientInternalReference: 'order-1042',
  awbRecipient: {
    name: 'Popescu Ion',
    phoneNumber: '0740123456',
    personType: 0,
    postalCode: '010101',
    address: 'Str. Exemplu Nr. 1',
    county: 'Bucuresti',
    city: 'Bucuresti',
    email: 'ion@example.com',
    service: 5,
  },
  parcels: [
    { weight: 1.5, length: 20, width: 10, height: 5 },
    { weight: 0.9 },
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

console.log(awb.awbNumber); // e.g. 'SD-123456789'
```

### Download a label

Label, proof-of-delivery and ledger downloads return a `Buffer`, not JSON.

```ts
import { writeFile } from 'node:fs/promises';

const label = await client.awb.downloadLabel('SD-123456789', {
  format: 'A4',        // 'A4' | 'A6'
  contentType: 'pdf',  // 'pdf' | 'html' | 'zpl'
});
await writeFile('label.pdf', label);
```

### Paginate

Every paginated list endpoint has an `iterate()` that walks the pages for you and yields items one by one. It supports early `break`; errors mid-iteration propagate to the caller.

```ts
for await (const point of client.pickupPoints.iterate()) {
  console.log(point.id, point.alias);
}
```

```ts
// Same pattern elsewhere; options: { countPerPage, startPage, maxPages }
for await (const row of client.awb.iterate({ startTimestamp: '2026-01-01 00:00:00' })) {
  console.log(row.awbNumber, row.awbStatus);
}
```

## Error handling

All SDK errors extend `SamedayError` and are chosen by HTTP status. The API's uniform `{ error: { code, message } }` envelope is unwrapped: `message` becomes the error message, `code` lands on `.code`, the HTTP status on `.status`, and the full parsed body stays on `.raw`.

```ts
import {
  SamedayError,
  ValidationError,
  RateLimitError,
} from 'sameday-node-sdk';

try {
  await client.awb.create(payload);
} catch (err) {
  if (err instanceof ValidationError) {
    console.error('Rejected payload:', err.message, err.raw);
  } else if (err instanceof RateLimitError) {
    console.error(`Rate limited; retry after ${err.retryAfter}s`);
  } else if (err instanceof SamedayError) {
    console.error(`Sameday API error ${err.status} (${err.code}): ${err.message}`);
  } else {
    throw err; // network failure, programming error, ...
  }
}
```

| Class | Raised on |
|---|---|
| `SamedayError` | Base class; any SDK failure |
| `ValidationError` | 400 — malformed request, details in `.raw` |
| `AuthenticationError` | 401 — missing/invalid credentials or token |
| `PermissionError` | 403 — authenticated but not allowed |
| `NotFoundError` | 404 — resource does not exist |
| `RateLimitError` | 429 — `.retryAfter` (seconds, when provided) |
| `ServerError` | 5xx — API failed to process the request |

## Configuration

Options accepted by `new SamedayClient(...)`:

| Option | Type | Default | Description |
|---|---|---|---|
| `user` | `string` | — (required) | API username, sent as `X-AUTH-USERNAME` |
| `password` | `string` | — (required) | API password, sent as `X-AUTH-PASSWORD` |
| `environment` | `'prod' \| 'demo'` | `'prod'` | Selects the base URL: `https://api.sameday.ro` (prod) or `https://sameday-api.demo.zitec.com` (demo). Ignored when `baseUrl` is set |
| `baseUrl` | `string` | — | Full base URL, overrides `environment` |
| `rememberMe` | `boolean` | `true` | `true` → 14-day token, `false` → 12-hour token |
| `platformName` | `string` | — | With `platformVersion`, sets the `X-Platform: name/version` header (both required) |
| `platformVersion` | `string` | — | See `platformName` |
| `timeoutMs` | `number` | `30000` | Per-request timeout in milliseconds |

## Testing and CI

```bash
npm test                  # unit tests (vitest, mocked fetch, no network)
npm run test:coverage     # unit tests with coverage thresholds
```

Integration tests are opt-in and skipped unless credentials are present:

```bash
SAMEDAY_USER=... SAMEDAY_PASSWORD=... SAMEDAY_ENV=demo npm run test:integration
```

CI (`.github/workflows/ci.yml`) runs lint, typecheck and the unit suite on Node 18, 20 and 22; the integration job runs only when the `SAMEDAY_USER`/`SAMEDAY_PASSWORD` secrets are configured.

## Releasing

Pushing a tag matching `v*` triggers the release workflow: it gates on lint + typecheck + tests, builds, then publishes to npm with provenance via OIDC trusted publishing (no npm token secrets) and creates a GitHub Release from the tag.

```bash
npm version patch   # or minor / major
git push --follow-tags
```

## API reference

```bash
npm run docs   # typedoc → docs/
```

## License

MIT — see [LICENSE](LICENSE).
