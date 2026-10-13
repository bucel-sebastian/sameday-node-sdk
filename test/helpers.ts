/** Shared test utilities — no network, only constructed `Response` objects. */

/** Builds a JSON `Response` with the given status and extra headers. */
export function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

/** Builds a `Response` from a raw body string (possibly non-JSON). */
export function rawResponse(
  text: string,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(text, { status, headers });
}

/** Normalizes `RequestInit.headers` into a plain record for assertions. */
export function getHeaders(init?: RequestInit): Record<string, string> {
  const headers = init?.headers;
  if (headers === undefined) {
    return {};
  }
  if (headers instanceof Headers) {
    return Object.fromEntries(headers);
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers as [string, string][]);
  }
  return headers;
}

/** Returns the request body when it is a string (our pipeline always sends strings). */
export function getBody(init?: RequestInit): string {
  return typeof init?.body === 'string' ? init.body : '';
}
