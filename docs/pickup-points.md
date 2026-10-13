# Pickup points

Sender locations registered on your account, managed through
`client.pickupPoints` (`PickupPointsResource`).

## Method map

| Method | API endpoint |
|---|---|
| `list(filters?)` | `GET /api/client/pickup-points` |
| `iterate(options?)` | walks `list` across pages |
| `create(payload)` | `POST /api/client/pickup-points` |
| `edit(pickupPointId, payload)` | `PATCH /api/client/pickup-points/{id}` |
| `delete(idPickupPoint)` | `DELETE /api/client/pickup-points/{id}` |
| `addContactPerson(idPickupPoint, payload)` | `POST /api/client/pickup-points/{id}/contact-person` |

Pickup-point ids appear as strings in AWB payloads (`pickupPoint: '81234'`)
and as numbers in these management endpoints — pass them through as given.

## List

`list()` returns one page of `Paginated<PickupPointListItem>`:

```ts
const page = await client.pickupPoints.list({ page: 1, countPerPage: 50 });

console.log(page.total, page.pages);
for (const point of page.data) {
  console.log(point.id, point.alias, point.address, point.status);
}
```

Every pickup point includes its `pickupPointContactPerson` details
(`id`, `name`, `phoneNumber`, `email`, ...). To walk all pages, use
`iterate()` — see [Pagination](pagination.md):

```ts
for await (const point of client.pickupPoints.iterate()) {
  console.log(point.id, point.alias);
}
```

## Create

`create()` takes a `PickupPointType`. `county`, `city`, `address`, `alias`
and `pickupPointContactPerson` are required; `county`/`city` are **ids** from
`client.geolocation.counties()` / `client.geolocation.cities()`:

```ts
const counties = await client.geolocation.counties({ name: 'Bucuresti' });
const cities = await client.geolocation.cities({ county: 'Bucuresti' });

const created = await client.pickupPoints.create({
  county: String(counties.data[0]?.id),
  city: String(cities.data[0]?.id),
  address: 'Str. Exemplu Nr. 1',
  alias: 'Warehouse-1',
  postalCode: '010101',       // optional
  cutOff: '18:00',            // optional, hour:minutes
  defaultPickupPoint: 0,      // optional, 0|1
  pickupPointContactPerson: [
    {
      name: 'Popescu Ion',
      phoneNumber: '0740123456',
      email: 'ion@example.com', // optional
      defaultContactPerson: 1,  // optional, 0|1
    },
  ],
});

console.log(created.id); // number; created.contact_persons holds the contact
```

## Edit

`edit()` accepts a **string** pickup-point id and a
`NonMandatoryPickupPointType` — send only the fields you want to change
(all optional, including `status: 0 | 1` to deactivate/activate):

```ts
await client.pickupPoints.edit('81234', {
  alias: 'Warehouse-1 (HQ)',
  cutOff: '16:00',
  status: 1,
});
```

## Delete

`delete()` takes a **number** id and resolves to `void` on 204:

```ts
await client.pickupPoints.delete(81234);
```

## Contact persons

Add a contact person to an existing pickup point (`ContactPersonType` —
`name` and `phoneNumber` required):

```ts
const added = await client.pickupPoints.addContactPerson(81234, {
  name: 'Ionescu Maria',
  phoneNumber: '0740987654',
  position: 'Manager',
  email: 'maria@example.com',
  defaultContactPerson: 0,
});

console.log(added.id); // new contact-person id
```

`addContactPerson` is the only contact-person operation this SDK exposes —
there is no update/delete for contacts, and `NonMandatoryPickupPointType`
(the `edit()` payload) intentionally has no contact-person field.
