# Pagination

Every list endpoint in the Sameday API returns the same page envelope, and
the SDK exposes it as `Paginated<T>`:

| Field | Type | Meaning |
|---|---|---|
| `total` | `number` | Total matching items |
| `currentPage` | `number` | Page you requested |
| `pages` | `number` | Total number of pages |
| `perPage` | `number` | Items per page (API default: 500) |
| `data` | `T[]` | The items |

## Single pages with `list()`

Pagination is controlled with the `page` and `countPerPage` query params:

```ts
const page = await client.services.list({ page: 2, countPerPage: 50 });

console.log(page.currentPage, page.pages, page.total);
console.log(page.data.map((s) => s.name));
```

The same shape applies everywhere: `client.awb.list()`,
`client.pickupPoints.list()`, `client.geolocation.cities()`,
`client.geolocation.counties()`, `client.services.list()`,
`client.status.list()`, `client.status.reasons()`, `client.ooh.getLockers()`,
`client.ooh.getLocations()` and `client.standbyReturns.list()`.

## Walking every page with `iterate()`

Each of those endpoints has an async-generator sibling that fetches pages on
demand and yields items one by one:

```ts
for await (const service of client.services.iterate()) {
  console.log(service.id, service.name);
}
```

Behavior:

- **Lazy** — pages are fetched only as the loop consumes them.
- **Early `break` is safe** — the generator cleans up; no further pages are
  fetched.
- **Errors propagate** — an API failure mid-iteration throws out of the
  `for await` loop; nothing is swallowed.
- **Empty-page guard** — a page with no items ends iteration even if the API
  claimed more pages (protects against inconsistent totals).

### `IterateOptions`

The second argument tunes the walk:

| Option | Default | Meaning |
|---|---|---|
| `countPerPage` | `500` (API default) | Items requested per page |
| `startPage` | `1` | First page to fetch |
| `maxPages` | — | Safety cap on total pages fetched |

```ts
// At most 10 pages of 100, starting from page 5
for await (const row of client.awb.iterate({}, { countPerPage: 100, startPage: 5, maxPages: 10 })) {
  console.log(row.awbNumber);
}
```

Endpoints that also accept **filters** take them as the first argument. On
`awb.iterate`, `iterateCities` and `iterateCounties` the filter type omits
`page`/`countPerPage` entirely (the iterator owns paging); on the others the
values are accepted but overridden by the iterator:

```ts
// 24h window (API limit on /api/client-awb-list)
for await (const row of client.awb.iterate({
  startTimestamp: '2026-01-01 00:00:00',
  endTimestamp: '2026-01-01 23:59:59',
})) {
  console.log(row.awbNumber);
}
```

## Which resources have `iterate()`

| Resource | Iterator | Yields |
|---|---|---|
| `client.awb` | `iterate(filters?, options?)` | `ClientAwbListItem` |
| `client.pickupPoints` | `iterate(options?)` | `PickupPointListItem` |
| `client.geolocation` | `iterateCities(filters?, options?)` | `City` |
| `client.geolocation` | `iterateCounties(filters?, options?)` | `County` |
| `client.services` | `iterate(options?)` | `ClientService` |
| `client.status` | `iterateStatuses(filters?, options?)` | `StatusListItem` |
| `client.status` | `iterateReasons(filters?, options?)` | `StatusReasonItem` |
| `client.ooh` | `iterateLockers(filters?, options?)` | `LockerLocation` |
| `client.ooh` | `iterateLocations(filters?, options?)` | `OohLocation` |
| `client.standbyReturns` | `iterate(filters?, options?)` | `StandbyReturnAwb` |

## Endpoints without `iterate()`

Three list-shaped endpoints deliberately have no iterator:

- **`client.status.sync()`** (and `syncMarketplace`/`syncCrossBorder`/
  `syncCrossBorderMarketplace`) and **`client.uitCodes.sync()`** return
  `StatusSyncPage` / `UitCodeSyncPage` — per the spec they carry only
  `currentPage`, `perPage` and `data` (no `total`/`pages`), so a page-walk
  cannot be driven. They also cap the requested interval (2 hours for status
  sync, 2 days for UIT codes); loop yourself over time windows if you need
  more.
- **`client.ledger.*`** returns binary CSV downloads (`Buffer`), not pages.

Polling pattern for the sync endpoints:

```ts
const end = new Date();
const start = new Date(end.getTime() - 2 * 60 * 60 * 1000); // 2h window (API max)

const page = await client.status.sync({
  startTimestamp: start.toISOString(),
  endTimestamp: end.toISOString(),
});

for (const entry of page.data) {
  console.log(entry.parcelAwbNumber, entry.statusLabel, entry.statusDate);
}
```
