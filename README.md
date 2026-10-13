# sameday-node-sdk

[![npm version](https://img.shields.io/npm/v/sameday-node-sdk.svg)](https://www.npmjs.com/package/sameday-node-sdk)
[![CI](https://github.com/bucel-sebastian/sameday-node-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/bucel-sebastian/sameday-node-sdk/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/npm/l/sameday-node-sdk.svg)](https://opensource.org/license/mit)

TypeScript/JavaScript client for the Sameday courier API (Romania): AWBs, pickup points, geolocation, status sync, lockers/OOH, COD ledgers, standby returns and UIT codes.

## Features

- **Zero runtime dependencies** — native `fetch`, Node.js >= 18
- **Full 36-endpoint coverage** across nine namespaces (`awb`, `pickupPoints`, `geolocation`, `services`, `status`, `ooh`, `ledger`, `standbyReturns`, `uitCodes`)
- **Typed error hierarchy** — HTTP status mapped to `ValidationError`, `AuthenticationError`, `NotFoundError`, `RateLimitError`, ...
- **Bracket-notation form encoding** — pass plain nested JS objects; the SDK sends `awbRecipient[name]=...` bodies the API expects
- **Async-iterator pagination** — `for await (const item of client.<resource>.iterate())` walks every page
- **Automatic auth** — token obtained, cached and refreshed for you (12h or 14-day tokens)
- **Dual ESM + CJS builds** with bundled type declarations

## Installation

```bash
npm install sameday-node-sdk
```

Requires **Node.js >= 18** (the SDK uses the built-in `fetch`).

### Quickstart

```ts
import { SamedayClient } from 'sameday-node-sdk';

const client = new SamedayClient({
  user: process.env.SAMEDAY_USER!,
  password: process.env.SAMEDAY_PASSWORD!,
  environment: 'demo', // 'prod' (default) | 'demo'
});

const awb = await client.awb.create({
  pickupPoint: '81234',
  packageType: 1,
  packageWeight: 2.4,
  service: '5',
  awbPayment: 1,
  cashOnDelivery: 0,
  insuredValue: 0,
  thirdPartyPickup: 0,
  awbRecipient: { name: 'Popescu Ion', phoneNumber: '0740123456', personType: 0,
    postalCode: '010101', address: 'Str. Exemplu Nr. 1', county: 'Bucuresti',
    city: 'Bucuresti', email: 'ion@example.com', service: 5 },
  parcels: [{ weight: 1.5 }],
});

console.log(awb.awbNumber);
```

## Guides

| Guide | What it covers |
|---|---|
| [Getting started](docs/getting-started.md) | Install, auth flow, first API call, demo vs prod |
| [AWB lifecycle](docs/awb.md) | Create, estimate cost, cancel, mutate, list, download labels/POD |
| [Pickup points](docs/pickup-points.md) | List, create, edit, delete, contact persons |
| [Pagination](docs/pagination.md) | `Paginated<T>` responses and `iterate()` async generators |
| [Error handling](docs/errors.md) | Error hierarchy, envelope mapping, timeouts, retrying |
| [Configuration](docs/configuration.md) | All client options, `X-Platform` header, timeouts, `fetchImpl` |
| [Testing](docs/testing.md) | Unit suite, opt-in integration suite, GitHub secrets |
| [Releasing](docs/releasing.md) | Versioning, tag-driven releases, OIDC trusted publishing |

The full method reference is generated with `npm run docs` into `docs/api/index.html`.

## Error handling

Every SDK error extends `SamedayError` and is chosen by HTTP status. The API's `{ error: { code, message } }` envelope is unwrapped onto `.message`/`.code`; the HTTP status is on `.status` and the parsed body on `.raw`.

| Class | Raised on |
|---|---|
| `SamedayError` | Base class; also timeouts and JSON parse failures |
| `ValidationError` | 400 — malformed request (details in `.raw`) |
| `AuthenticationError` | 401 — invalid credentials/token |
| `PermissionError` | 403 — authenticated but not allowed |
| `NotFoundError` | 404 — resource does not exist |
| `RateLimitError` | 429 — exposes `.retryAfter` (seconds) |
| `ServerError` | 5xx — API failed to process the request |

```ts
import { ValidationError, RateLimitError } from 'sameday-node-sdk';

try {
  await client.awb.create(payload);
} catch (err) {
  if (err instanceof ValidationError) console.error(err.message, err.raw);
  else if (err instanceof RateLimitError) console.error('retry after', err.retryAfter, 's');
  else throw err;
}
```

See [Error handling](docs/errors.md) for the full hierarchy, timeout/network behavior and a retry example.

## Configuration

Options accepted by `new SamedayClient(...)`:

| Option | Type | Default | Description |
|---|---|---|---|
| `user` | `string` | — (required) | API username, sent as `X-AUTH-USERNAME` |
| `password` | `string` | — (required) | API password, sent as `X-AUTH-PASSWORD` |
| `environment` | `'prod' \| 'demo'` | `'prod'` | Base URL preset: `https://api.sameday.ro` or `https://sameday-api.demo.zitec.com`; ignored when `baseUrl` is set |
| `baseUrl` | `string` | — | Full base URL, overrides `environment` |
| `rememberMe` | `boolean` | `true` | `true` → 14-day token, `false` → 12-hour token |
| `platformName` | `string` | — | With `platformVersion` sets `X-Platform: name/version` (both required) |
| `platformVersion` | `string` | — | See `platformName` |
| `timeoutMs` | `number` | `30000` | Per-request timeout in milliseconds |

See [Configuration](docs/configuration.md) for details, including custom base URLs and `fetchImpl` injection.

## Testing and CI

```bash
npm test                # unit suite (vitest, mocked fetch, no network)
npm run test:coverage   # unit suite + v8 coverage thresholds
```

The live-API integration suite is opt-in and skips itself without credentials:

```bash
SAMEDAY_USER=... SAMEDAY_PASSWORD=... SAMEDAY_ENV=demo npm run test:integration
```

CI (`.github/workflows/ci.yml`) runs lint, typecheck and the unit suite on Node 18, 20 and 22 for every push/PR; the integration job runs only when the `SAMEDAY_USER`/`SAMEDAY_PASSWORD` repository secrets are configured. Details in [Testing](docs/testing.md).

## Releasing

Releases are tag-driven: bump the version, push a `v*` tag, and `.github/workflows/release.yml` gates on lint + typecheck + tests, builds, verifies the tag matches `package.json`, publishes to npm with **provenance via OIDC trusted publishing** (no npm token secret), and creates a GitHub Release:

```bash
npm version patch   # or minor / major
git push --follow-tags
```

Full walkthrough in [Releasing](docs/releasing.md).

## License

[MIT](LICENSE)
