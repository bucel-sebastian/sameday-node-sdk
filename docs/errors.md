# Error handling

Every error thrown by the SDK is an instance of `SamedayError` (or one of
its subclasses). Nothing else — parse failures of your own arguments, plain
`TypeError`s from misconfiguration — is wrapped.

## Hierarchy

```text
SamedayError            base class (also: timeouts, JSON parse failures)
├── ValidationError     400 — malformed request
├── AuthenticationError 401 — missing/invalid credentials or token
├── PermissionError     403 — authenticated but not allowed
├── NotFoundError       404 — resource does not exist
├── RateLimitError      429 — adds .retryAfter (seconds)
└── ServerError         5xx — API failed to process the request
```

## Status → class mapping

| `error.status` | Class | Extra properties |
|---|---|---|
| 400 | `ValidationError` | `.raw` — parsed error details |
| 401 | `AuthenticationError` | |
| 403 | `PermissionError` | |
| 404 | `NotFoundError` | |
| 429 | `RateLimitError` | `.retryAfter` — `Retry-After` header in seconds, when provided |
| 500–599 | `ServerError` | |
| other | `SamedayError` | |

Every error carries:

| Property | Type | Meaning |
|---|---|---|
| `.message` | `string` | Human-readable message (see envelope below) |
| `.status` | `number \| undefined` | HTTP status of the failed response |
| `.code` | `number \| undefined` | API error code from the envelope |
| `.raw` | `unknown` | Parsed response body, when one could be obtained |
| `.cause` | `unknown` | Underlying error (timeout abort, JSON parse failure, ...) |

## The `{ error: { code, message } }` envelope

Failed API responses use a uniform envelope:

```json
{ "error": { "code": 4001, "message": "The given data was invalid." } }
```

The SDK unwraps it for you:

- `error.message` — the envelope's `message`. When the body is not JSON (or
  has no envelope), the raw body text is used; as a last resort
  `HTTP <status> <reason>` (e.g. `HTTP 429 Too Many Requests`).
- `error.code` — the envelope's numeric `code`.
- `error.raw` — the whole parsed body, for digging into field-level details:

```ts
import { ValidationError } from 'sameday-node-sdk';

try {
  await client.awb.create(payload);
} catch (err) {
  if (err instanceof ValidationError) {
    console.error(err.message); // "The given data was invalid."
    console.error(err.code);    // e.g. 4001
    console.error(err.raw);     // full parsed body with field details
  }
}
```

Non-JSON error bodies (HTML error pages from proxies, empty 5xx bodies) never
throw a parse error — the text is used as the message instead.

## Timeouts and network failures

- Each request (including the internal authenticate call) is aborted after
  `timeoutMs` (default 30 s). A timeout throws a plain `SamedayError` with
  `Request timed out after <n>ms: <METHOD> <url>` and `.cause` set to the
  abort error. `error.status` is `undefined` — it did not come from a
  response.
- Connection-level failures (DNS, TLS, socket reset) are **not** wrapped:
  the original fetch `TypeError` propagates with its own `.cause` chain.
- A 2xx response whose body is not valid JSON throws
  `SamedayError: Failed to parse JSON response: <METHOD> <url>` with the raw
  text on `.raw`.

## Authentication failures are handled for you

A `401` is special-cased inside the client: the token is discarded, the
client re-authenticates **once** and retries the request. You only see an
`AuthenticationError` when re-authentication itself fails (bad credentials)
or when the retried request is rejected again.

## Catching and retrying

Catch specific classes first, rethrow what you don't handle:

```ts
import {
  RateLimitError,
  ServerError,
  SamedayError,
  ValidationError,
} from 'sameday-node-sdk';

async function withRetries<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (error) {
      const retriable = error instanceof RateLimitError || error instanceof ServerError;
      if (!retriable || i >= attempts) throw error;
      const waitMs = error instanceof RateLimitError && error.retryAfter !== undefined
        ? error.retryAfter * 1000
        : 500 * 2 ** (i - 1); // 1s, 2s, ... exponential backoff
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}

try {
  const awb = await withRetries(() => client.awb.create(payload));
} catch (error) {
  if (error instanceof ValidationError) {
    // Fix the payload — retrying cannot help.
    console.error('Invalid AWB:', error.message, error.raw);
  } else if (error instanceof SamedayError) {
    console.error(`Sameday error (status=${error.status}, code=${error.code}):`, error.message);
  } else {
    throw error; // network failure, bug in caller code, ...
  }
}
```

Guidelines:

- **Retry** `RateLimitError` (honor `.retryAfter`) and `ServerError` (5xx).
- **Don't blind-retry** `ValidationError`/`NotFoundError` — the request is
  wrong; inspect `.raw`.
- **Don't retry** `AuthenticationError` without refreshing credentials — the
  client already retried once after re-authenticating.
- Timeouts and network errors are `SamedayError`/`TypeError` without a
  `.status` — decide based on whether the operation is idempotent.
