import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuthenticationError, RateLimitError, SamedayError } from '../src/errors';
import { DEFAULT_TIMEOUT_MS, request } from '../src/http/request';
import { getBody, getHeaders, jsonResponse, rawResponse } from './helpers';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('request()', () => {
  it('serializes query params, skipping null and undefined values', async () => {
    let seen = '';
    const fetchImpl: typeof fetch = async (input) => {
      seen = String(input);
      return jsonResponse({ ok: true });
    };
    await request({
      method: 'GET',
      url: 'https://api.test/things',
      query: {
        page: 1,
        search: 'ion popescu',
        dropNull: null,
        dropUndefined: undefined,
        tags: ['a', 'b', null],
      },
      fetchImpl,
    });
    expect(seen).toBe(
      'https://api.test/things?page=1&search=ion%20popescu&tags=a&tags=b',
    );
  });

  it('appends to an existing query string', async () => {
    let seen = '';
    const fetchImpl: typeof fetch = async (input) => {
      seen = String(input);
      return jsonResponse({});
    };
    await request({
      method: 'GET',
      url: 'https://api.test/things?existing=1',
      query: { page: 2 },
      fetchImpl,
    });
    expect(seen).toBe('https://api.test/things?existing=1&page=2');
  });

  it('leaves the URL untouched when the whole query is skipped', async () => {
    let seen = '';
    const fetchImpl: typeof fetch = async (input) => {
      seen = String(input);
      return jsonResponse({});
    };
    await request({
      method: 'GET',
      url: 'https://api.test/things',
      query: { a: undefined, b: null },
      fetchImpl,
    });
    expect(seen).toBe('https://api.test/things');
  });

  it('sends form bodies urlencoded with the default headers', async () => {
    let captured: RequestInit | undefined;
    const fetchImpl: typeof fetch = async (_input, init) => {
      captured = init;
      return jsonResponse({ ok: true });
    };
    await request({
      method: 'POST',
      url: 'https://api.test/form',
      formBody: { remember_me: true, nested: { a: 1 } },
      headers: { 'X-Custom': 'v' },
      fetchImpl,
    });
    const headers = getHeaders(captured);
    expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(headers['Accept']).toBe('application/json');
    expect(headers['User-Agent']).toBe('sameday-node-sdk/0.1.0');
    expect(headers['X-Custom']).toBe('v');
    expect(getBody(captured)).toBe('remember_me=true&nested%5Ba%5D=1');
  });

  it('uses the injected fetch implementation', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ via: 'mock' }));
    const result = await request<{ via: string }>({
      method: 'GET',
      url: 'https://api.test/x',
      fetchImpl,
    });
    expect(result.via).toBe('mock');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://api.test/x');
    expect(fetchImpl.mock.calls[0]?.[1]?.method).toBe('GET');
  });

  it('falls back to globalThis.fetch when no fetchImpl is given', async () => {
    const spy = vi.fn<typeof fetch>(async () => jsonResponse({ from: 'global' }));
    vi.stubGlobal('fetch', spy);
    const result = await request<{ from: string }>({
      method: 'GET',
      url: 'https://api.test/global',
    });
    expect(result.from).toBe('global');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('parses JSON responses', async () => {
    const fetchImpl: typeof fetch = async () => jsonResponse({ total: 3, items: [1, 2, 3] });
    const result = await request<{ total: number }>({
      method: 'GET',
      url: 'https://api.test/json',
      fetchImpl,
    });
    expect(result.total).toBe(3);
  });

  it('tolerates empty bodies in json mode', async () => {
    const fetchImpl: typeof fetch = async () => new Response(null, { status: 200 });
    const result = await request({
      method: 'GET',
      url: 'https://api.test/empty',
      fetchImpl,
    });
    expect(result).toBeUndefined();
  });

  it('wraps JSON parse failures in a SamedayError', async () => {
    const fetchImpl: typeof fetch = async () =>
      rawResponse('this is not json', 200, { 'content-type': 'application/json' });
    const error = await request({
      method: 'GET',
      url: 'https://api.test/broken',
      fetchImpl,
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SamedayError);
    expect((error as Error).message).toMatch(/Failed to parse JSON/);
    expect((error as SamedayError).raw).toBe('this is not json');
  });

  it('reads binary responses into a Buffer', async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(new Uint8Array([1, 2, 3, 255]), { status: 200 });
    const result = await request<Buffer>({
      method: 'GET',
      url: 'https://api.test/label.png',
      responseType: 'binary',
      fetchImpl,
    });
    expect(Buffer.isBuffer(result)).toBe(true);
    expect([...result]).toEqual([1, 2, 3, 255]);
  });

  it('maps non-2xx responses to typed errors', async () => {
    const fetchImpl: typeof fetch = async () =>
      jsonResponse({ error: { code: 401, message: 'Bad token' } }, 401);
    const error = await request({
      method: 'GET',
      url: 'https://api.test/protected',
      fetchImpl,
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AuthenticationError);
    expect((error as Error).message).toBe('Bad token');
    expect((error as AuthenticationError).status).toBe(401);
    expect((error as AuthenticationError).code).toBe(401);
  });

  it('maps 429 responses with Retry-After to RateLimitError', async () => {
    const fetchImpl: typeof fetch = async () =>
      jsonResponse({ error: { code: 429, message: 'Slow down' } }, 429, { 'retry-after': '17' });
    const error = await request({
      method: 'GET',
      url: 'https://api.test/limited',
      fetchImpl,
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(RateLimitError);
    expect((error as RateLimitError).retryAfter).toBe(17);
  });

  it('aborts with a clear timeout error when the deadline elapses', async () => {
    const fetchImpl: typeof fetch = (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      });
    const error = await request({
      method: 'GET',
      url: 'https://api.test/slow',
      timeoutMs: 25,
      fetchImpl,
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SamedayError);
    expect((error as Error).message).toMatch(/timed out after 25ms/);
  });

  it('propagates non-abort fetch failures untouched', async () => {
    const networkError = new TypeError('fetch failed');
    const fetchImpl: typeof fetch = async () => {
      throw networkError;
    };
    await expect(
      request({ method: 'GET', url: 'https://api.test/down', fetchImpl }),
    ).rejects.toBe(networkError);
  });

  it('uses a 30s timeout by default', () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(30_000);
  });
});
