# Getting started

Install the package, create a client, call the API — the SDK handles authentication for you.

```bash
npm install sameday-node-sdk
```

Requires Node.js >= 18 (native `fetch`). Zero runtime dependencies.

## Create a client

```ts
import { SamedayClient } from 'sameday-node-sdk';

const client = new SamedayClient({
  user: 'your-api-user',
  password: 'your-api-password',
  environment: 'demo', // optional; 'prod' (default) or 'demo'
});
```

| Environment | Base URL |
|---|---|
| `prod` (default) | `https://api.sameday.ro` |
| `demo` | `https://sameday-api.demo.zitec.com` |

Use `demo` while developing against the sandbox, and drop the option (or pass
`environment: 'prod'`) in production. A fully custom `baseUrl` overrides both —
see [Configuration](configuration.md).

If your integration is identified by a platform (marketplace, e-commerce
engine), pass `platformName`/`platformVersion`; they are sent as the
`X-Platform: name/version` header:

```ts
const client = new SamedayClient({
  user: '...',
  password: '...',
  platformName: 'my-shop',
  platformVersion: '1.0.0', // => X-Platform: my-shop/1.0.0
});
```

## How authentication works

You never handle tokens yourself:

1. **Lazily on the first request**, the client calls `POST /api/authenticate`
   with your credentials (`X-AUTH-USERNAME` / `X-AUTH-PASSWORD` headers and a
   `remember_me` form field).
2. The response token is **cached in memory**. With `rememberMe: true`
   (default) the token is valid 14 days; with `false` it is valid 12 hours.
   The client refreshes it proactively ~60 seconds before it expires.
3. Every subsequent request carries the token in the `X-AUTH-TOKEN` header.
4. If the API answers **401 anyway**, the client discards the token,
   re-authenticates **once** and retries the request — it never loops.
5. Concurrent first requests **share a single authenticate call**
   (single-flight), so `Promise.all([...])` does not stampede the API.

If you need the raw token (e.g. to hand to another system), `ensureToken()`
is public:

```ts
const token = await client.ensureToken();
```

## First call

Anything you need from the catalogues can be fetched without side effects —
for example the delivery services available to your account:

```ts
const services = await client.services.list();

console.log(services.total); // total services
for (const service of services.data) {
  console.log(service.id, service.name);
}
```

List responses are always `Paginated<T>` (`total`, `currentPage`, `pages`,
`perPage`, `data`) — see [Pagination](pagination.md) for single-page calls and
the `iterate()` helpers.

To look up city/county ids for pickup-point addresses:

```ts
const counties = await client.geolocation.counties({ name: 'Bucuresti' });
const cities = await client.geolocation.cities({ county: 'Bucuresti' });
```

## Where to go next

- [AWB lifecycle](awb.md) — create your first waybill, download its label.
- [Pickup points](pickup-points.md) — manage sender locations and contacts.
- [Error handling](errors.md) — typed errors, timeouts, retrying.
- [Configuration](configuration.md) — every client option in one table.
