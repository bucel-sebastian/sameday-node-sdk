# Testing

Two suites: a fast unit suite that never touches the network, and an opt-in
integration suite that runs against the live (demo) API.

## Unit suite

```bash
npm test              # vitest run — mocked fetch, no network
npm run test:watch    # watch mode
npm run test:coverage # v8 coverage + thresholds
```

- Every test injects a fake `fetch` through the client's `fetchImpl` option,
  so the full pipeline (auth headers, token cache, form encoding, query
  serialization, error mapping) is exercised without sockets.
- Tests assert the outgoing request in detail: method, full URL, headers and
  the exact serialized body.
- `npm run test:coverage` enforces 90% line/statement/branch/function
  coverage on `src/http/**`, `src/client.ts` and `src/errors.ts`; CI fails
  below the thresholds.

### Wire-byte encoding assertions

The Sameday API parses bodies with PHP-style bracket rules, so the exact
bytes matter. Tests pin the invariants on the serialized output:

```ts
const form = new URLSearchParams(call.body);
expect(form.get('awbRecipient[name]')).toBe('Popescu Ion'); // bracket keys
expect(form.get('parcels[0][weight]')).toBe('1.5');
expect(call.body).toContain('awbRecipient%5Bname%5D=');    // single-encoded on the wire
expect(call.body).not.toContain('%255B');                  // never double-encoded
```

The same assertions exist for query strings (`basicEstimateCost` flattens
parcels to `parcels[0][weight]=...` keys), plus `undefined`/`null` stripping
and unicode handling. See `test/form.test.ts` and `test/request.test.ts`.

## Integration suite (opt-in)

Live-API tests live in `test/integration/` and are **env-gated**: without
credentials every test skips (exit 0), so plain `npm test` and secret-less CI
runs stay green.

```bash
# bash / GitHub Actions
SAMEDAY_USER=my-user SAMEDAY_PASSWORD=my-password SAMEDAY_ENV=demo npm run test:integration
```

```powershell
# PowerShell
$env:SAMEDAY_USER = "my-user"
$env:SAMEDAY_PASSWORD = "my-password"
$env:SAMEDAY_ENV = "demo"   # optional: 'demo' (default) or 'prod'
npm run test:integration
```

| Variable | Required | Meaning |
|---|---|---|
| `SAMEDAY_USER` | yes | API user; absence skips the suite |
| `SAMEDAY_PASSWORD` | yes | API password; absence skips the suite |
| `SAMEDAY_ENV` | no | `demo` (default) or `prod` |

Properties of the suite (see `test/integration/helpers.ts`):

- **Read-only / non-committing** — authenticate, paginated catalogues,
  geolocation, price estimates. Nothing creates, edits or cancels real AWBs.
- **Capture-and-assert** — the live client wraps `fetch` with a recorder, so
  wire-format assertions (bracket encoding) run on the real serialized bytes
  regardless of the response status; if authentication is refused, the same
  payload is replayed through the SDK's low-level `request()` pipeline with a
  placeholder token so the encoding check still sees genuine bytes.
- **Known caveat** — if the demo API rejects the configured credentials
  (403 "Invalid credentials"), the auth test fails with `PermissionError` by
  design: the failure is the signal that the credentials are wrong, and the
  test is deliberately not weakened to mask it.

## CI

`.github/workflows/ci.yml` runs on pushes to `master`, on pull requests and
on manual `workflow_dispatch`:

- **`test` job** — Node **18 / 20 / 22** matrix: `npm ci` → `npm run lint`
  → `npm run typecheck` → `npm run test:coverage`; the coverage report is
  uploaded as an artifact on Node 22.
- **`integration` job** — runs only when the repository secrets are
  configured. Secrets cannot be referenced directly in `if:` conditionals
  (GitHub restriction), so they are exposed as job-level env vars and every
  step is guarded on `env.SAMEDAY_USER != ''`; with no secrets the job
  no-ops cleanly.

### Adding the secrets

1. On GitHub: **Settings → Secrets and variables → Actions**.
2. Under **Repository secrets**, add:
   - `SAMEDAY_USER` — your API user,
   - `SAMEDAY_PASSWORD` — your API password.
3. The workflow sets `SAMEDAY_ENV: demo` itself; no third secret is needed.

Without secrets every CI run stays green — integration simply skips.
