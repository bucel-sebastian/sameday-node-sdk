import { describe, expect, it } from 'vitest';

import {
  AuthenticationError,
  AwbResource,
  GeolocationResource,
  LedgerResource,
  NotFoundError,
  OohResource,
  PermissionError,
  PickupPointsResource,
  RateLimitError,
  SamedayClient,
  SamedayError,
  ServerError,
  ServicesResource,
  StandbyReturnsResource,
  StatusResource,
  UitCodesResource,
  ValidationError,
  VERSION,
} from '../src/index';

describe('VERSION', () => {
  it('matches the package version', () => {
    expect(VERSION).toBe('0.1.0');
  });
});

describe('public surface', () => {
  it('exports the client and the full error hierarchy', () => {
    expect(typeof SamedayClient).toBe('function');
    for (const ErrorClass of [
      SamedayError,
      AuthenticationError,
      PermissionError,
      ValidationError,
      NotFoundError,
      RateLimitError,
      ServerError,
    ]) {
      const error = new ErrorClass('x');
      expect(error).toBeInstanceOf(SamedayError);
      expect(error).toBeInstanceOf(Error);
    }
  });

  it('exports all nine resource classes', () => {
    for (const ResourceClass of [
      AwbResource,
      PickupPointsResource,
      GeolocationResource,
      ServicesResource,
      StatusResource,
      OohResource,
      LedgerResource,
      StandbyReturnsResource,
      UitCodesResource,
    ]) {
      expect(typeof ResourceClass).toBe('function');
    }
  });
});
