import { AuthenticationError, SamedayError } from './errors';
import { request, type ResponseType } from './http/request';
import { AwbResource } from './resources/awb';
import { GeolocationResource } from './resources/geolocation';
import { LedgerResource } from './resources/ledger';
import { OohResource } from './resources/ooh';
import { PickupPointsResource } from './resources/pickup-points';
import { ServicesResource } from './resources/services';
import { StandbyReturnsResource } from './resources/standby-returns';
import { StatusResource } from './resources/status';
import { UitCodesResource } from './resources/uit-codes';
import type { AuthResponse, SamedayEnvironment } from './types';

/** Base URL of the production API. */
export const PROD_BASE_URL = 'https://api.sameday.ro';
/** Base URL of the demo/staging API. */
export const DEMO_BASE_URL = 'https://sameday-api.demo.zitec.com';

/** Refresh the cached token this long (ms) before it actually expires. */
const REFRESH_MARGIN_MS = 60_000;

/** Construction options for {@link SamedayClient}. */
export interface SamedayClientOptions {
  user: string;
  password: string;
  /** Defaults to `'prod'`; ignored when {@link SamedayClientOptions.baseUrl} is set. */
  environment?: SamedayEnvironment;
  /** Full base URL; overrides {@link SamedayClientOptions.environment}. */
  baseUrl?: string;
  /** Request a 14-day token (default `true`; `false` → 12-hour token). */
  rememberMe?: boolean;
  platformName?: string;
  platformVersion?: string;
  /** Per-request timeout in milliseconds (default 30s). */
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/** Options for the low-level {@link SamedayClient.request} escape hatch. */
export interface ClientRequestOptions {
  method: string;
  /** API path, with or without a leading slash (e.g. `/api/awb`). */
  path: string;
  query?: Record<string, unknown>;
  /** Form body encoded as `application/x-www-form-urlencoded`. */
  body?: Record<string, unknown>;
  responseType?: ResponseType;
}

function stripTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

interface AuthSession {
  token: string;
  /** Epoch ms after which the token must be refreshed; `Infinity` when unknown. */
  expireAt: number;
}

/**
 * Entry point of the SDK: handles authentication (lazy, single-flight,
 * auto-refresh) and exposes a low-level `request()` used by the resource
 * namespaces.
 */
export class SamedayClient {
  /** AWB (waybill) operations: create, estimate, list, download documents. */
  readonly awb: AwbResource;
  /** Client pickup-point management: list, create, edit, delete, contact persons. */
  readonly pickupPoints: PickupPointsResource;
  /** Geolocation lookups: cities and counties. */
  readonly geolocation: GeolocationResource;
  /** Delivery services catalogue. */
  readonly services: ServicesResource;
  /** Parcel/awb status lookups and synchronization. */
  readonly status: StatusResource;
  /** Out-of-home (locker/pudo) locations. */
  readonly ooh: OohResource;
  /** Cash-on-delivery ledger exports. */
  readonly ledger: LedgerResource;
  /** Standby-return awbs. */
  readonly standbyReturns: StandbyReturnsResource;
  /** UIT codes: sync, history and save. */
  readonly uitCodes: UitCodesResource;

  private readonly baseUrl: string;
  private readonly user: string;
  private readonly password: string;
  private readonly rememberMe: boolean;
  private readonly platformHeader?: string;
  private readonly timeoutMs?: number;
  private readonly fetchImpl?: typeof fetch;

  private session: AuthSession | null = null;
  private authInFlight: Promise<string> | null = null;

  constructor(options: SamedayClientOptions) {
    const environment = options.environment ?? 'prod';
    this.baseUrl = stripTrailingSlash(
      options.baseUrl ?? (environment === 'demo' ? DEMO_BASE_URL : PROD_BASE_URL),
    );
    this.user = options.user;
    this.password = options.password;
    this.rememberMe = options.rememberMe ?? true;
    this.platformHeader =
      options.platformName !== undefined && options.platformVersion !== undefined
        ? `${options.platformName}/${options.platformVersion}`
        : undefined;
    this.timeoutMs = options.timeoutMs;
    this.fetchImpl = options.fetchImpl;

    this.awb = new AwbResource(this);
    this.pickupPoints = new PickupPointsResource(this);
    this.geolocation = new GeolocationResource(this);
    this.services = new ServicesResource(this);
    this.status = new StatusResource(this);
    this.ooh = new OohResource(this);
    this.ledger = new LedgerResource(this);
    this.standbyReturns = new StandbyReturnsResource(this);
    this.uitCodes = new UitCodesResource(this);
  }

  /**
   * Returns a valid auth token, authenticating lazily. Concurrent callers
   * share a single in-flight `POST /api/authenticate` call, and the cached
   * token is refreshed ~60s before its expiry.
   */
  ensureToken(): Promise<string> {
    const session = this.session;
    if (session !== null && Date.now() < session.expireAt - REFRESH_MARGIN_MS) {
      return Promise.resolve(session.token);
    }
    if (this.authInFlight === null) {
      this.authInFlight = this.authenticate().finally(() => {
        this.authInFlight = null;
      });
    }
    return this.authInFlight;
  }

  /**
   * Low-level request escape hatch: prefixes the configured base URL,
   * attaches `X-AUTH-TOKEN` and transparently re-authenticates + retries
   * exactly once on 401 (the authenticate call itself is never retried on
   * 401).
   */
  async request<T = unknown>(options: ClientRequestOptions): Promise<T> {
    const token = await this.ensureToken();
    try {
      return await this.dispatch<T>(options, token);
    } catch (error) {
      if (!(error instanceof AuthenticationError)) {
        throw error;
      }
      this.session = null;
      const freshToken = await this.ensureToken();
      return this.dispatch<T>(options, freshToken);
    }
  }

  private async dispatch<T>(options: ClientRequestOptions, token: string): Promise<T> {
    const path = options.path.startsWith('/') ? options.path : `/${options.path}`;
    return request<T>({
      method: options.method,
      url: `${this.baseUrl}${path}`,
      query: options.query,
      formBody: options.body,
      headers: { 'X-AUTH-TOKEN': token, ...this.platformHeaders() },
      responseType: options.responseType,
      timeoutMs: this.timeoutMs,
      fetchImpl: this.fetchImpl,
    });
  }

  private platformHeaders(): Record<string, string> {
    return this.platformHeader === undefined ? {} : { 'X-Platform': this.platformHeader };
  }

  /**
   * `POST /api/authenticate` — uses the raw pipeline (not `this.request`)
   * so a 401 here can never trigger the retry-once path.
   */
  private async authenticate(): Promise<string> {
    const auth = await request<Partial<AuthResponse>>({
      method: 'POST',
      url: `${this.baseUrl}/api/authenticate`,
      headers: {
        'X-AUTH-USERNAME': this.user,
        'X-AUTH-PASSWORD': this.password,
        ...this.platformHeaders(),
      },
      formBody: { remember_me: this.rememberMe },
      timeoutMs: this.timeoutMs,
      fetchImpl: this.fetchImpl,
    });

    if (typeof auth.token !== 'string' || auth.token === '') {
      throw new SamedayError('Authentication response did not include a token', { raw: auth });
    }

    const parsedExpiry = Date.parse(auth.expire_at_utc ?? auth.expire_at ?? '');
    this.session = {
      token: auth.token,
      expireAt: Number.isNaN(parsedExpiry) ? Number.POSITIVE_INFINITY : parsedExpiry,
    };
    return auth.token;
  }
}
