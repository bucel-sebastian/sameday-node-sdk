# Configuration

All behavior is configured through the `SamedayClientOptions` constructor
object:

```ts
import { SamedayClient } from 'sameday-node-sdk';

const client = new SamedayClient({
  user: 'your-api-user',
  password: 'your-api-password',
});
```

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `user` | `string` | — (required) | API username, sent as `X-AUTH-USERNAME` on every authenticate call |
| `password` | `string` | — (required) | API password, sent as `X-AUTH-PASSWORD` on every authenticate call |
| `environment` | `'prod' \| 'demo'` | `'prod'` | Base URL preset (see below); ignored when `baseUrl` is set |
| `baseUrl` | `string` | — | Full base URL; overrides `environment`. A trailing `/` is stripped |
| `rememberMe` | `boolean` | `true` | `true` → 14-day token, `false` → 12-hour token (sent as the `remember_me` form field) |
| `platformName` | `string` | — | Together with `platformVersion` sets the `X-Platform` header; **both must be set** or the header is omitted |
| `platformVersion` | `string` | — | See `platformName` |
| `timeoutMs` | `number` | `30000` | Per-request timeout in milliseconds, applied to every request including the internal authenticate call |
| `fetchImpl` | `typeof fetch` | global `fetch` | Injectable fetch implementation (see below) |

## Environments

| `environment` | Base URL |
|---|---|
| `'prod'` (default) | `https://api.sameday.ro` |
| `'demo'` | `https://sameday-api.demo.zitec.com` |

Both are exported as constants if you need them:

```ts
import { DEMO_BASE_URL, PROD_BASE_URL } from 'sameday-node-sdk';
```

For proxied or self-hosted gateways, point at them directly — `baseUrl`
takes precedence over `environment`:

```ts
const client = new SamedayClient({
  user: '...',
  password: '...',
  baseUrl: 'https://sameday-proxy.example.com',
});
```

## The `X-Platform` header

Sameday asks integrations to identify their platform. Set **both**
`platformName` and `platformVersion` and the SDK sends:

```text
X-Platform: my-shop/1.0.0
```

The header is attached to the authenticate call and to every authenticated
request. If either value is missing the header is simply not sent.

## Token lifetime (`rememberMe`)

| Value | Token validity |
|---|---|
| `true` (default) | 14 days |
| `false` | 12 hours |

The client caches the token in memory and refreshes it ~60 seconds before it
expires, so neither value needs manual handling — see
[Getting started](getting-started.md#how-authentication-works).

## Timeouts (`timeoutMs`)

Default 30 000 ms (`DEFAULT_TIMEOUT_MS`). On expiry the request is aborted
and a `SamedayError` (`Request timed out after ...`) is thrown — see
[Error handling](errors.md#timeouts-and-network-failures). Live integration
tests use a shorter 15 s timeout; pick whatever fits your infrastructure:

```ts
const client = new SamedayClient({ user: '...', password: '...', timeoutMs: 15_000 });
```

## Injecting `fetch` (`fetchImpl`)

`fetchImpl` replaces the global `fetch` the SDK dispatches through. Useful
for tests, request recording, mTLS agents or instrumentation:

```ts
const recordingFetch: typeof fetch = async (input, init) => {
  console.log('->', init?.method, String(input));
  return fetch(input, init); // delegate to the real fetch
};

const client = new SamedayClient({
  user: '...',
  password: '...',
  fetchImpl: recordingFetch,
});
```

The same hook powers the unit suite (fully mocked, no network) and the
integration suite's wire-byte capture — see [Testing](testing.md).

## Low-level escape hatch

Anything not wrapped by a resource method can be called through
`client.request()` (same auth, same encoding, same error mapping):

```ts
const result = await client.request<{ total?: number }>({
  method: 'GET',
  path: '/api/client/services',
  query: { page: 1, countPerPage: 10 },
});
```

`path` is appended to the configured base URL, `body` is form-encoded
(bracket notation), and `responseType: 'binary'` returns a `Buffer`.
