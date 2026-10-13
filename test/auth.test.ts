import { describe, expect, it } from 'vitest';

import { SamedayClient, type SamedayClientOptions } from '../src/client';
import {
  AuthenticationError,
  PermissionError,
  ServerError,
} from '../src/errors';
import { getBody, getHeaders, jsonResponse } from './helpers';

interface RecordedCall {
  url: string;
  init: RequestInit | undefined;
}

type Router = (call: RecordedCall, index: number) => Response | Promise<Response>;

/** Overrides allowed in tests — credentials and fetch are always provided by `setup`. */
type ClientOverrides = Omit<Partial<SamedayClientOptions>, 'user' | 'password' | 'fetchImpl'>;

/** Creates a client wired to a routing fetch mock; returns it with all recorded calls. */
function setup(
  router: Router,
  options: ClientOverrides = {},
): { client: SamedayClient; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const call: RecordedCall = { url: String(input), init };
    calls.push(call);
    return router(call, calls.length);
  };
  const client = new SamedayClient({ user: 'demo-user', password: 'demo-pass', fetchImpl, ...options });
  return { client, calls };
}

const isAuthUrl = (url: string): boolean => url.endsWith('/api/authenticate');

function authResponse(token: string, expiresInMs = 3_600_000): Response {
  const expire = new Date(Date.now() + expiresInMs).toISOString();
  return jsonResponse({ token, expire_at: expire, expire_at_utc: expire });
}

describe('SamedayClient authentication', () => {
  it('shares a single in-flight authenticate call between concurrent callers', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let authCalls = 0;
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (isAuthUrl(url)) {
        authCalls += 1;
        await gate;
        return authResponse('shared-token');
      }
      return jsonResponse({ ok: true });
    };
    const client = new SamedayClient({ user: 'u', password: 'p', fetchImpl });

    const pending = [
      client.ensureToken(),
      client.ensureToken(),
      client.ensureToken(),
      client.ensureToken(),
      client.ensureToken(),
    ];
    release();
    const tokens = await Promise.all(pending);

    expect(tokens).toEqual(Array(5).fill('shared-token'));
    expect(authCalls).toBe(1);
  });

  it('caches the token and reuses it across requests', async () => {
    const { client, calls } = setup((call) =>
      isAuthUrl(call.url) ? authResponse('tok-a') : jsonResponse({ ok: true }),
    );

    await client.request({ method: 'GET', path: '/api/awb' });
    await client.request({ method: 'GET', path: '/api/awb' });

    const authCalls = calls.filter((call) => isAuthUrl(call.url));
    const dataCalls = calls.filter((call) => !isAuthUrl(call.url));
    expect(authCalls).toHaveLength(1);
    expect(dataCalls).toHaveLength(2);
    expect(getHeaders(authCalls[0].init)).toMatchObject({
      'X-AUTH-USERNAME': 'demo-user',
      'X-AUTH-PASSWORD': 'demo-pass',
    });
    expect(getHeaders(dataCalls[0].init)['X-AUTH-TOKEN']).toBe('tok-a');
    expect(getHeaders(dataCalls[1].init)['X-AUTH-TOKEN']).toBe('tok-a');
  });

  it('refreshes the token when it is within 60s of expiry', async () => {
    let authCount = 0;
    const { client, calls } = setup((call) => {
      if (isAuthUrl(call.url)) {
        authCount += 1;
        return authResponse(`tok-${authCount}`, 30_000); // expires within the refresh margin
      }
      return jsonResponse({ ok: true });
    });

    await client.request({ method: 'GET', path: '/api/awb' });
    await client.request({ method: 'GET', path: '/api/awb' });

    const authCalls = calls.filter((call) => isAuthUrl(call.url));
    const dataCalls = calls.filter((call) => !isAuthUrl(call.url));
    expect(authCalls).toHaveLength(2);
    expect(getHeaders(dataCalls[0].init)['X-AUTH-TOKEN']).toBe('tok-1');
    expect(getHeaders(dataCalls[1].init)['X-AUTH-TOKEN']).toBe('tok-2');
  });

  it('honours expire_at when expire_at_utc is absent', async () => {
    let authCount = 0;
    const { client, calls } = setup((call) => {
      if (isAuthUrl(call.url)) {
        authCount += 1;
        return jsonResponse({
          token: `tok-${authCount}`,
          expire_at: new Date(Date.now() + 30_000).toISOString(),
        });
      }
      return jsonResponse({ ok: true });
    });

    await client.request({ method: 'GET', path: '/api/awb' });
    await client.request({ method: 'GET', path: '/api/awb' });

    expect(calls.filter((call) => isAuthUrl(call.url))).toHaveLength(2);
  });

  it('keeps a token without parseable expiry cached', async () => {
    const { client, calls } = setup((call) =>
      isAuthUrl(call.url)
        ? jsonResponse({ token: 'no-expiry', expire_at: 'not-a-date' })
        : jsonResponse({ ok: true }),
    );

    await client.request({ method: 'GET', path: '/api/awb' });
    await client.request({ method: 'GET', path: '/api/awb' });

    expect(calls.filter((call) => isAuthUrl(call.url))).toHaveLength(1);
    await expect(client.ensureToken()).resolves.toBe('no-expiry');
  });

  it('keeps a token cached when both expiry fields are missing', async () => {
    const { client, calls } = setup((call) =>
      isAuthUrl(call.url) ? jsonResponse({ token: 'untimed' }) : jsonResponse({ ok: true }),
    );

    await client.request({ method: 'GET', path: '/api/awb' });
    await client.request({ method: 'GET', path: '/api/awb' });

    expect(calls.filter((call) => isAuthUrl(call.url))).toHaveLength(1);
    await expect(client.ensureToken()).resolves.toBe('untimed');
  });

  it('sends remember_me=true by default and false when disabled', async () => {
    const { client, calls } = setup((call) =>
      isAuthUrl(call.url) ? authResponse('tok') : jsonResponse({ ok: true }),
    );
    await client.ensureToken();
    expect(getBody(calls[0].init)).toBe('remember_me=true');

    const { client: short, calls: shortCalls } = setup(
      (call) => (isAuthUrl(call.url) ? authResponse('tok') : jsonResponse({ ok: true })),
      { rememberMe: false },
    );
    await short.ensureToken();
    expect(getBody(shortCalls[0].init)).toBe('remember_me=false');
  });

  it('rejects an authenticate response without a token', async () => {
    const { client, calls } = setup((call) =>
      isAuthUrl(call.url) ? jsonResponse({ unexpected: true }) : jsonResponse({ ok: true }),
    );
    const error = await client
      .request({ method: 'GET', path: '/api/awb' })
      .catch((caught: unknown) => caught);
    expect((error as Error).message).toBe('Authentication response did not include a token');
    expect(calls.filter((call) => isAuthUrl(call.url))).toHaveLength(1);
  });
});

describe('SamedayClient 401 handling', () => {
  it('re-authenticates and retries exactly once after a 401', async () => {
    let authCount = 0;
    const { client, calls } = setup((call) => {
      if (isAuthUrl(call.url)) {
        authCount += 1;
        return authResponse(`tok-${authCount}`);
      }
      const token = getHeaders(call.init)['X-AUTH-TOKEN'];
      if (token === 'tok-1') {
        return jsonResponse({ error: { code: 401, message: 'expired' } }, 401);
      }
      return jsonResponse({ ok: true, token });
    });

    const result = await client.request<{ ok: boolean; token: string }>({
      method: 'GET',
      path: '/api/awb',
    });

    expect(result).toEqual({ ok: true, token: 'tok-2' });
    const authCalls = calls.filter((call) => isAuthUrl(call.url));
    const dataCalls = calls.filter((call) => !isAuthUrl(call.url));
    expect(authCalls).toHaveLength(2);
    expect(dataCalls).toHaveLength(2);
    expect(getHeaders(dataCalls[1].init)['X-AUTH-TOKEN']).toBe('tok-2');
  });

  it('throws AuthenticationError without looping when the retried request is also 401', async () => {
    let authCount = 0;
    const { client, calls } = setup((call) => {
      if (isAuthUrl(call.url)) {
        authCount += 1;
        return authResponse(`tok-${authCount}`);
      }
      return jsonResponse({ error: { code: 401, message: 'still expired' } }, 401);
    });

    const error = await client
      .request({ method: 'GET', path: '/api/awb' })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AuthenticationError);
    expect((error as Error).message).toBe('still expired');
    expect(calls.filter((call) => isAuthUrl(call.url))).toHaveLength(2);
    expect(calls.filter((call) => !isAuthUrl(call.url))).toHaveLength(2);
  });

  it('never retries when the authenticate endpoint itself returns 401', async () => {
    const { client, calls } = setup((call) =>
      isAuthUrl(call.url)
        ? jsonResponse({ error: { code: 401, message: 'bad credentials' } }, 401)
        : jsonResponse({ ok: true }),
    );

    const error = await client
      .request({ method: 'GET', path: '/api/awb' })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AuthenticationError);
    expect(calls.filter((call) => isAuthUrl(call.url))).toHaveLength(1);
    expect(calls.filter((call) => !isAuthUrl(call.url))).toHaveLength(0);
  });

  it('never retries when the authenticate endpoint returns 403', async () => {
    const { client, calls } = setup((call) =>
      isAuthUrl(call.url)
        ? jsonResponse({ error: { code: 403, message: 'no permission' } }, 403)
        : jsonResponse({ ok: true }),
    );

    const error = await client
      .request({ method: 'GET', path: '/api/awb' })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(PermissionError);
    expect(calls.filter((call) => isAuthUrl(call.url))).toHaveLength(1);
    expect(calls.filter((call) => !isAuthUrl(call.url))).toHaveLength(0);
  });

  it('propagates non-401 errors without re-authenticating', async () => {
    const { client, calls } = setup((call) =>
      isAuthUrl(call.url)
        ? authResponse('tok-1')
        : jsonResponse({ error: { code: 500, message: 'boom' } }, 500),
    );

    const error = await client
      .request({ method: 'GET', path: '/api/awb' })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ServerError);
    expect(calls.filter((call) => isAuthUrl(call.url))).toHaveLength(1);
    expect(calls.filter((call) => !isAuthUrl(call.url))).toHaveLength(1);
  });
});

describe('SamedayClient configuration', () => {
  it('targets the production host by default', async () => {
    const { client, calls } = setup((call) =>
      isAuthUrl(call.url) ? authResponse('tok') : jsonResponse({ ok: true }),
    );
    await client.ensureToken();
    expect(calls[0].url).toBe('https://api.sameday.ro/api/authenticate');
  });

  it('targets the demo host when environment is demo', async () => {
    const { client, calls } = setup(
      (call) => (isAuthUrl(call.url) ? authResponse('tok') : jsonResponse({ ok: true })),
      { environment: 'demo' },
    );
    await client.ensureToken();
    expect(calls[0].url).toBe('https://sameday-api.demo.zitec.com/api/authenticate');
  });

  it('lets baseUrl override the environment and strips trailing slashes', async () => {
    const { client, calls } = setup(
      (call) => (isAuthUrl(call.url) ? authResponse('tok') : jsonResponse({ ok: true })),
      { baseUrl: 'https://custom.test/', environment: 'demo' },
    );
    await client.request({ method: 'GET', path: 'api/awb' });
    expect(calls[0].url).toBe('https://custom.test/api/authenticate');
    expect(calls[1].url).toBe('https://custom.test/api/awb');
  });

  it('sends X-Platform on authenticate and data requests', async () => {
    const { client, calls } = setup(
      (call) => (isAuthUrl(call.url) ? authResponse('tok') : jsonResponse({ ok: true })),
      { platformName: 'my-shop', platformVersion: '1.2.3' },
    );
    await client.request({ method: 'GET', path: '/api/awb' });
    expect(getHeaders(calls[0].init)['X-Platform']).toBe('my-shop/1.2.3');
    expect(getHeaders(calls[1].init)['X-Platform']).toBe('my-shop/1.2.3');
  });

  it('omits X-Platform when the platform metadata is incomplete', async () => {
    const { client, calls } = setup(
      (call) => (isAuthUrl(call.url) ? authResponse('tok') : jsonResponse({ ok: true })),
      { platformName: 'my-shop' },
    );
    await client.request({ method: 'GET', path: '/api/awb' });
    expect(getHeaders(calls[1].init)['X-Platform']).toBeUndefined();
  });
});
