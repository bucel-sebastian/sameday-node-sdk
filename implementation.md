# Implementation Plan: `sameday-node-sdk`

TypeScript SDK for the Sameday Courier API, designed to make integrations easier.

**Status:** approved, ready to implement
**Package name:** `sameday-node-sdk` (free on npm)
**Target:** Node.js ≥ 18, native `fetch`, zero runtime dependencies

---

## 1. API Research Summary

Source: OpenAPI 3.0 spec (v2.0.0) extracted from `https://sameday-api.demo.zitec.com/documentation/client` (spec committed to `openapi/openapi-spec.json`).

- **36 endpoints** — AWB lifecycle, pickup points, geolocation, status sync, lockers/OOH, COD ledgers, standby returns, UIT codes
- **Environments:**
  - prod: `https://api.sameday.ro`
  - demo: `https://sameday-api.demo.zitec.com`
- **Auth:** `POST /api/authenticate` with `X-AUTH-USERNAME` / `X-AUTH-PASSWORD` headers, body `remember_me=true` (form-urlencoded) → `{ token, expire_at, expire_at_utc }`
  - token valid **12h** (default) or **14 days** (`remember_me=true`)
  - subsequent requests: `X-AUTH-TOKEN` header
- **Request bodies:** `application/x-www-form-urlencoded` (NOT JSON) for POST/PUT/PATCH, with **nested objects**
- **Pagination:** query params `page` + `countPerPage` (default 500) → response `{ total, currentPage, pages, perPage, data }`
- **Errors:** uniform envelope `{ error: { code, message } }`
- **No existing Node SDK** for Sameday (only official PHP SDK) — greenfield opportunity

---

## 2. Decisions (confirmed)

| Decision | Choice |
|---|---|
| Language | **TypeScript** (strict), compiled to ESM + CJS + `.d.ts` |
| API coverage | **Full** — all 36 endpoints |
| HTTP client | **Native `fetch`** (Node 18+), zero runtime deps |
| npm package | **`sameday-node-sdk`** |
| Nested form encoding | **Bracket notation** (`awbRecipient[name]=...`) — verify against demo API first |
| Release trigger | **Tag push `v*`** → workflow tests, publishes, creates GitHub Release |
| npm auth | **OIDC trusted publishing + provenance** (no token secrets) |

---

## 3. Project Setup

- **Build:** `tsup` → `dist/esm`, `dist/cjs`, `dist/index.d.ts`
- **Test:** `vitest` + v8 coverage
- **Lint:** ESLint + `@typescript-eslint`
- **Runtime deps:** none
- **package.json:**
  - `files: ["dist"]`
  - `publishConfig.access: "public"`
  - `prepublishOnly: "npm run build"`
  - `engines: { "node": ">=18" }`
  - `exports` map with `types` / `import` / `require`
- **Scripts:** `build`, `test`, `test:coverage`, `test:integration`, `typecheck`, `lint`, `prepublishOnly`

---

## 4. Architecture

```
src/
  index.ts                 # public entry — re-exports SamedayClient, errors, types, consts
  client.ts                # SamedayClient — auth, token cache/refresh, resource namespaces
  http/
    request.ts             # fetch pipeline: headers, timeouts, JSON/binary parsing, retries
    form.ts                # bracket-notation form encoder for nested bodies
  errors.ts                # typed error hierarchy
  resources/
    awb.ts                 # create, estimateCost, basicEstimateCost, cancel, addParcel,
                           # updateCod, getByClientReference, list, downloadLabel,
                           # downloadStandbyReturnLabel, downloadProofOfDelivery,
                           # activateStandbyReturn, saveUitCode
    pickupPoints.ts        # list, create, edit, delete, addContactPerson
    geolocation.ts         # getCities, getCounties
    status.ts              # sync (standard/mkt/xb/mkt-xb), list, reasons, updateParcelStatus
    ooh.ts                 # getLockers, getLocations
    ledger.ts              # downloadCodLedger, validateTransferredLedgers, downloadInvoiceLedger
    standbyReturns.ts      # list
    uitCodes.ts            # sync
    services.ts            # list
  types/                   # TS interfaces generated from the OpenAPI schemas
```

### 4.1 `SamedayClient`

```ts
const client = new SamedayClient({
  user, password,
  environment: 'demo' | 'prod',   // or { baseUrl } for custom
  rememberMe?: boolean,           // default true (14-day tokens)
  platformName?: string,          // X-Platform header: "name/version"
  platformVersion?: string,
  timeoutMs?: number,
});

client.awb.create(...)
client.pickupPoints.list(...)
client.request({ method, path, query, body })   // low-level escape hatch
```

- Lazy auth on first request; token cached in memory until `expire_at`
- On `401`: refresh token **once**, retry request; never loop
- Single-flight: concurrent first requests share one auth call
- `User-Agent: sameday-node-sdk/<version>`

### 4.2 Form encoding (`http/form.ts`)

Bracket notation for nested data, verified against demo API *before* resources are implemented:

```
awbRecipient[name]=John&awbRecipient[city]=123&parcels[0][weight]=0.5&parcels[0][width]=15
```

- Strip `undefined` / `null`
- Numbers/booleans serialized as-is
- Fallback plan: if the demo API rejects bracket notation, switch to JSON-encoding nested values (isolate this behind the encoder so only `form.ts` changes)

### 4.3 Errors (`errors.ts`)

```
SamedayError (base: status, code, message, raw body)
├── AuthenticationError   (401)
├── PermissionError       (403)
├── ValidationError       (400 — exposes .errors details)
├── NotFoundError         (404)
├── RateLimitError        (429)
└── ServerError           (5xx)
```

### 4.4 Pagination

```ts
client.pickupPoints.list({ page, countPerPage })       // single page
for await (const pp of client.pickupPoints.iterate()) { ... }  // auto page-walk
```

Async iterators on every paginated list endpoint; support early `break` and propagate errors mid-iteration.

---

## 5. Endpoint Coverage Map

| Resource | Endpoints |
|---|---|
| **awb** | `POST /api/awb`, `POST /api/awb/estimate-cost`, `POST /api/awb/estimate-cost/{awbId}`, `POST /api/awb/basic-estimate-cost`, `GET /api/client/awb/{ref}`, `DELETE /api/awb/{awbOrParcelNumber}`, `POST /api/awb/{awb}/parcel`, `PUT /api/awb/{awb}/update-cod`, `PATCH /api/awb/{awb}/standby`, `GET /api/client-awb-list`, `GET /api/awb/download/{awb}/{format}/{contentType}/{disposition}`, `GET /api/awb/download-standby-return/...`, `GET /api/awb/{awb}/proof-of-delivery/{disposition}`, `PATCH /api/awb/{parcel}/uit-code` |
| **pickupPoints** | `GET/POST/DELETE/PATCH /api/client/pickup-points...`, `POST .../{id}/contact-person` |
| **geolocation** | `GET /api/geolocation/city`, `GET /api/geolocation/county` |
| **status** | `GET /api/client/status-sync`, `mkt-status-sync`, `xb-status-sync`, `mkt-xb-status-sync`, `GET /api/public/status-list`, `GET /api/logistic-flow/status-reason`, `PUT /api/parcel/{awb}/update-status` |
| **ooh** | `GET /api/client/lockers`, `GET /api/client/ooh-locations` |
| **ledger** | `GET /api/client/cod-ledger-download`, `GET /api/client/cod-transferred-ledgers-export`, `GET /api/client/download-ledger-for-invoice/{invoice}/{disposition}` |
| **standbyReturns** | `GET /api/client/standby-returns` |
| **uitCodes** | `GET /api/client/uit-code-sync` |
| **services** | `GET /api/client/services` |
| **auth** | `POST /api/authenticate` (internal) |

**Convenience consts:** `PackageType`, `AwbPaymentType`, `PersonType`, download `Format` / `ContentType` / `Disposition` enums (map the API's magic numbers).

**Binary responses:** label/POD/ledger downloads return `Buffer` (via `arrayBuffer()`), not JSON.

---

## 6. Testing Strategy

### Unit tests (vitest, mocked `fetch`, no network)

| File | Covers |
|---|---|
| `form.test.ts` | Bracket-encoding: nested objects, arrays, numbers/booleans/dates, unicode, `undefined`/`null` stripping; full AWB payload → snapshot |
| `auth.test.ts` | Token fetch + `remember_me`, cache until `expire_at`, single-flight concurrent auth, refresh-once-on-401, no retry loop |
| `errors.test.ts` | 400/401/403/404/429/5xx → typed errors, `ValidationError.errors`, binary error bodies |
| `pagination.test.ts` | Async iterator: multi-page, final page, empty, early `break`, mid-iteration error |
| `resources/*.test.ts` | Per-resource: correct method/path/query/body; PDF/binary handling |

- **Fixtures:** `test/fixtures/` — payloads derived from the OpenAPI spec + captured demo responses
- **Coverage:** v8 provider; thresholds enforced (~90% lines on `src/http`, `client.ts`, `errors.ts`); CI fails below threshold

### Integration tests (opt-in `npm run test:integration`)

Requires demo credentials via env vars (`SAMEDAY_USER`, `SAMEDAY_PASSWORD`, `SAMEDAY_ENV=demo`); skipped when absent.

Flow: authenticate → services → pickup points → geolocation → `estimateCost` → `createAwb` → download label → `cancelAwb`.

---

## 7. GitHub Actions

### `.github/workflows/ci.yml` — push to `main` + PRs

- Node **18 / 20 / 22** matrix
- `npm ci` → lint → typecheck → unit tests + coverage (artifact upload; Codecov optional)
- `integration` job: runs only when secrets are configured (`if:` guard), otherwise skipped cleanly

### `.github/workflows/release.yml` — `push: tags: ['v*']`

1. Checkout, Node 22, `npm ci`
2. Gate: lint + typecheck + full test suite
3. `npm run build`
4. `npm publish --provenance --access public` via **OIDC trusted publishing**
   - One-time setup: npmjs.com → package → Settings → Trusted Publisher → add this repo + workflow filename
5. Create GitHub Release from the tag with auto-generated notes

**Release flow:** `npm version patch|minor|major` → `git push --follow-tags` → workflow does the rest.

---

## 8. Documentation

- **README:** install, quickstart (end-to-end AWB example ported from the official PHP SDK), environment config, error handling, pagination examples
- **typedoc** for full method reference

---

## 9. Implementation Order

1. **Scaffold** — tsconfig, tsup, vitest, eslint, package.json, gitignore
2. **Smoke test encoding** — probe demo API (`POST /api/awb/estimate-cost`, read-only/safe) with bracket-notation forms; confirm before building on it
3. **Core** — `http/form.ts`, `http/request.ts`, `errors.ts`, `client.ts` (auth/token/retry)
4. **Types** — generate TS interfaces from committed `openapi/openapi-spec.json`
5. **Resources** — awb → pickupPoints → geolocation → status → ooh → ledger → standbyReturns → uitCodes → services
6. **Pagination** — async iterators on all paginated lists
7. **Tests** — full unit suite + fixtures + opt-in integration suite
8. **CI/CD** — ci.yml + release.yml
9. **Docs** — README + typedoc

## 10. Verification Criteria

- [ ] Bracket encoding accepted by demo API (estimate-cost smoke test passes)
- [ ] `npm run typecheck` + `npm run lint` clean
- [ ] Unit tests green on Node 18/20/22, coverage thresholds met
- [ ] Integration suite passes against demo env when creds provided
- [ ] `npm pack` output contains only `dist/` + README + license
- [ ] Both `import` (ESM) and `require` (CJS) entry points resolve in a scratch project
- [ ] CI green on a PR; tag push exercises release workflow (dry-run `--provenance` check before first real publish)
