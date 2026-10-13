/**
 * Bracket-notation form encoder for `application/x-www-form-urlencoded` bodies
 * (the Sameday API expects nested payloads as `key[sub]=value`).
 *
 * Keys and values are percent-encoded when the returned {@link URLSearchParams}
 * is serialized (`toString()`): brackets, `&`, `=`, unicode etc. become
 * percent-encodings equivalent to `encodeURIComponent` (spaces serialize as
 * `+`, the canonical form-encoding separator). Values are stored raw on
 * purpose — pre-applying `encodeURIComponent` would double-encode on
 * serialization (`%` → `%25`).
 *
 * Rules:
 * - `undefined` / `null` values are stripped
 * - numbers / booleans are stringified as-is, `Date` becomes its ISO string
 * - nested objects → `key[sub]=value`, arrays → `key[0][sub]=value` /
 *   `key[0]=a&key[1]=b` (array holes caused by stripped values keep their index)
 * - empty objects / empty arrays contribute nothing
 */
function appendEntry(params: URLSearchParams, key: string, value: unknown): void {
  if (value === undefined || value === null) {
    return;
  }
  if (value instanceof Date) {
    params.append(key, value.toISOString());
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      appendEntry(params, `${key}[${index}]`, item);
    });
    return;
  }
  if (typeof value === 'object') {
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      appendEntry(params, `${key}[${childKey}]`, childValue);
    }
    return;
  }
  params.append(key, String(value));
}

/** Recursively encodes `body` into bracket-notation form fields. */
export function encodeForm(body: Record<string, unknown>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    appendEntry(params, key, value);
  }
  return params;
}
