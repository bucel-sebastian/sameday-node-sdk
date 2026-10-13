import type { ApiErrorEnvelope } from './types';

/** Common options accepted by every {@link SamedayError}. */
export interface SamedayErrorOptions {
  /** HTTP status of the failed response, when the error came from one. */
  status?: number;
  /** API error code from the `{ error: { code, message } }` envelope. */
  code?: number;
  /** Parsed response body, when one could be obtained. */
  raw?: unknown;
  /** Underlying cause (e.g. a JSON parse failure or a network error). */
  cause?: unknown;
}

/**
 * Base class for every error raised by the SDK.
 *
 * Uses the ES2022-safe prototype fix (`Object.setPrototypeOf` + `new.target`)
 * so `instanceof` keeps working across the subclass chain.
 */
export class SamedayError extends Error {
  readonly status?: number;
  readonly code?: number;
  readonly raw?: unknown;

  constructor(message: string, options: SamedayErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = 'SamedayError';
    this.status = options.status;
    this.code = options.code;
    this.raw = options.raw;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 401 — missing or invalid credentials/token. */
export class AuthenticationError extends SamedayError {
  constructor(message: string, options: SamedayErrorOptions = {}) {
    super(message, options);
    this.name = 'AuthenticationError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 403 — authenticated, but not allowed to perform the operation. */
export class PermissionError extends SamedayError {
  constructor(message: string, options: SamedayErrorOptions = {}) {
    super(message, options);
    this.name = 'PermissionError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * 400 — malformed request. The parsed error details stay accessible through
 * the inherited {@link SamedayError.raw} (and `code` when the envelope
 * provided one).
 */
export class ValidationError extends SamedayError {
  constructor(message: string, options: SamedayErrorOptions = {}) {
    super(message, options);
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 404 — the addressed resource does not exist. */
export class NotFoundError extends SamedayError {
  constructor(message: string, options: SamedayErrorOptions = {}) {
    super(message, options);
    this.name = 'NotFoundError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 429 — rate limited; `retryAfter` is the `Retry-After` header in seconds. */
export class RateLimitError extends SamedayError {
  readonly retryAfter?: number;

  constructor(message: string, options: SamedayErrorOptions & { retryAfter?: number } = {}) {
    super(message, options);
    this.name = 'RateLimitError';
    this.retryAfter = options.retryAfter;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 5xx — the API failed to process an otherwise valid request. */
export class ServerError extends SamedayError {
  constructor(message: string, options: SamedayErrorOptions = {}) {
    super(message, options);
    this.name = 'ServerError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Reason phrases used when the body carries no usable message. */
const STATUS_TEXT: Readonly<Record<number, string | undefined>> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  408: 'Request Timeout',
  409: 'Conflict',
  413: 'Payload Too Large',
  415: 'Unsupported Media Type',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
};

/** Case-insensitive header lookup that accepts `Headers` or a plain record. */
function getHeader(
  headers: Headers | Record<string, string> | undefined,
  name: string,
): string | undefined {
  if (headers === undefined) {
    return undefined;
  }
  if (typeof (headers as Headers).get === 'function') {
    return (headers as Headers).get(name) ?? undefined;
  }
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers as Record<string, string>)) {
    if (key.toLowerCase() === wanted) {
      return value;
    }
  }
  return undefined;
}

/** Parses the `Retry-After` header when it expresses delta-seconds. */
function parseRetryAfter(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const seconds = Number.parseInt(value, 10);
  return Number.isNaN(seconds) ? undefined : seconds;
}

/**
 * Pulls `{ error: { code, message } }` out of an already-parsed body.
 * Returns `undefined` when there is no usable envelope.
 */
function extractEnvelope(parsed: unknown): { code?: number; message?: string } | undefined {
  if (typeof parsed !== 'object' || parsed === null) {
    return undefined;
  }
  const error = (parsed as Partial<ApiErrorEnvelope>).error;
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }
  return {
    code: typeof error.code === 'number' ? error.code : undefined,
    message: typeof error.message === 'string' ? error.message : undefined,
  };
}

/** `HTTP <status> <reason>` message used when nothing more useful exists. */
function statusMessage(status: number): string {
  const reason = STATUS_TEXT[status];
  return reason === undefined ? `HTTP ${status}` : `HTTP ${status} ${reason}`;
}

/**
 * Maps a failed HTTP response to a typed error.
 *
 * `body` may be the raw response text (it is JSON-parsed tolerantly) or an
 * already-parsed value; non-JSON bodies never throw. `headers` is only used to
 * pick up `Retry-After` for 429 responses.
 */
export function errorFromResponse(
  status: number,
  body: unknown,
  headers?: Headers | Record<string, string>,
): SamedayError {
  let parsed: unknown = body;
  let text: string | undefined;
  let isJson = false;
  if (typeof body === 'string') {
    text = body;
    try {
      parsed = JSON.parse(body);
      isJson = true;
    } catch {
      parsed = undefined;
    }
  }

  const envelope = extractEnvelope(parsed);
  // Envelope message → non-JSON body text → HTTP status text.
  const message =
    envelope?.message ??
    (!isJson && text !== undefined && text.trim() !== '' ? text : undefined) ??
    statusMessage(status);
  const options: SamedayErrorOptions = {
    status,
    code: envelope?.code,
    raw: typeof parsed === 'object' && parsed !== null ? parsed : undefined,
  };

  switch (status) {
    case 400:
      return new ValidationError(message, options);
    case 401:
      return new AuthenticationError(message, options);
    case 403:
      return new PermissionError(message, options);
    case 404:
      return new NotFoundError(message, options);
    case 429:
      return new RateLimitError(message, {
        ...options,
        retryAfter: parseRetryAfter(getHeader(headers, 'retry-after')),
      });
    default:
      if (status >= 500 && status < 600) {
        return new ServerError(message, options);
      }
      return new SamedayError(message, options);
  }
}
