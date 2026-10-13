import { describe, expect, it } from 'vitest';

import {
  AuthenticationError,
  errorFromResponse,
  NotFoundError,
  PermissionError,
  RateLimitError,
  SamedayError,
  ServerError,
  ValidationError,
} from '../src/errors';

describe('error classes', () => {
  it('exposes message, status, code and raw on the base class', () => {
    const error = new SamedayError('boom', { status: 418, code: 7, raw: { a: 1 } });
    expect(error.name).toBe('SamedayError');
    expect(error.message).toBe('boom');
    expect(error.status).toBe(418);
    expect(error.code).toBe(7);
    expect(error.raw).toEqual({ a: 1 });
  });

  it('keeps instanceof chains intact for every subclass', () => {
    const errors: SamedayError[] = [
      new AuthenticationError('a'),
      new PermissionError('b'),
      new ValidationError('c'),
      new NotFoundError('d'),
      new RateLimitError('e'),
      new ServerError('f'),
    ];
    for (const error of errors) {
      expect(error).toBeInstanceOf(SamedayError);
      expect(error).toBeInstanceOf(Error);
      expect(typeof error.stack).toBe('string');
    }
    expect(new AuthenticationError('a').name).toBe('AuthenticationError');
    expect(new PermissionError('b').name).toBe('PermissionError');
    expect(new ValidationError('c').name).toBe('ValidationError');
    expect(new NotFoundError('d').name).toBe('NotFoundError');
    expect(new RateLimitError('e').name).toBe('RateLimitError');
    expect(new ServerError('f').name).toBe('ServerError');
  });

  it('carries retryAfter on RateLimitError', () => {
    expect(new RateLimitError('slow down', { retryAfter: 30, status: 429 }).retryAfter).toBe(30);
    expect(new RateLimitError('no header').retryAfter).toBeUndefined();
  });

  it('keeps parsed validation details accessible on ValidationError', () => {
    const raw = { error: { code: 400, message: 'bad field' } };
    const error = new ValidationError('bad field', { status: 400, code: 400, raw });
    expect(error.raw).toEqual(raw);
    expect(error.code).toBe(400);
  });
});

describe('errorFromResponse', () => {
  it('maps status codes to the right error class', () => {
    expect(errorFromResponse(400, '')).toBeInstanceOf(ValidationError);
    expect(errorFromResponse(401, '')).toBeInstanceOf(AuthenticationError);
    expect(errorFromResponse(403, '')).toBeInstanceOf(PermissionError);
    expect(errorFromResponse(404, '')).toBeInstanceOf(NotFoundError);
    expect(errorFromResponse(429, '')).toBeInstanceOf(RateLimitError);
    expect(errorFromResponse(500, '')).toBeInstanceOf(ServerError);
    expect(errorFromResponse(503, '')).toBeInstanceOf(ServerError);

    const teapot = errorFromResponse(418, '');
    expect(teapot.constructor).toBe(SamedayError);
    expect(errorFromResponse(600, '').constructor).toBe(SamedayError);
  });

  it('parses the uniform { error: { code, message } } envelope', () => {
    const body = JSON.stringify({ error: { code: 403, message: 'This user is not authorized.' } });
    const error = errorFromResponse(403, body);
    expect(error).toBeInstanceOf(PermissionError);
    expect(error.message).toBe('This user is not authorized.');
    expect(error.code).toBe(403);
    expect(error.status).toBe(403);
    expect(error.raw).toEqual({ error: { code: 403, message: 'This user is not authorized.' } });
  });

  it('accepts an already-parsed body object', () => {
    const error = errorFromResponse(400, { error: { code: 400, message: 'bad' } });
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.message).toBe('bad');
    expect(error.raw).toEqual({ error: { code: 400, message: 'bad' } });
  });

  it('tolerates non-JSON bodies, using them as the message', () => {
    const error = errorFromResponse(502, '<html><body>Bad Gateway</body></html>');
    expect(error).toBeInstanceOf(ServerError);
    expect(error.message).toBe('<html><body>Bad Gateway</body></html>');
    expect(error.raw).toBeUndefined();
    expect(error.code).toBeUndefined();
  });

  it('falls back to HTTP status text when there is nothing usable', () => {
    expect(errorFromResponse(404, '').message).toBe('HTTP 404 Not Found');
    expect(errorFromResponse(429, '   ').message).toBe('HTTP 429 Too Many Requests');
    expect(errorFromResponse(599, undefined).message).toBe('HTTP 599');
    expect(errorFromResponse(418, undefined).message).toBe('HTTP 418');
  });

  it('falls back to status text for malformed or partial envelopes', () => {
    expect(errorFromResponse(403, JSON.stringify({ error: 'nope' })).message).toBe(
      'HTTP 403 Forbidden',
    );
    expect(errorFromResponse(403, JSON.stringify({ error: {} })).message).toBe(
      'HTTP 403 Forbidden',
    );
    expect(
      errorFromResponse(403, JSON.stringify({ error: { code: 'x', message: 5 } })).message,
    ).toBe('HTTP 403 Forbidden');
    expect(errorFromResponse(404, JSON.stringify({ detail: 'missing' })).message).toBe(
      'HTTP 404 Not Found',
    );
    // Already-parsed object body with no envelope.
    expect(errorFromResponse(404, { detail: 'missing' }).message).toBe('HTTP 404 Not Found');
  });

  it('reads Retry-After for rate limits from Headers and plain records', () => {
    const fromHeaders = errorFromResponse(429, '', new Headers({ 'Retry-After': '17' }));
    expect(fromHeaders).toBeInstanceOf(RateLimitError);
    expect((fromHeaders as RateLimitError).retryAfter).toBe(17);

    const fromRecord = errorFromResponse(429, '', { 'Retry-After': '5' });
    expect((fromRecord as RateLimitError).retryAfter).toBe(5);

    const noHeader = errorFromResponse(429, '', { 'content-type': 'application/json' });
    expect((noHeader as RateLimitError).retryAfter).toBeUndefined();

    const unusable = errorFromResponse(429, '', { 'retry-after': 'soon' });
    expect((unusable as RateLimitError).retryAfter).toBeUndefined();

    const noHeaders = errorFromResponse(429, '');
    expect((noHeaders as RateLimitError).retryAfter).toBeUndefined();

    const emptyHeaders = errorFromResponse(429, '', new Headers());
    expect((emptyHeaders as RateLimitError).retryAfter).toBeUndefined();
  });
});
