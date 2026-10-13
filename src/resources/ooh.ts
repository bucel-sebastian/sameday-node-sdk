import type { SamedayClient } from '../client';
import { iteratePaginated, type IterateOptions } from '../http/paginate';
import type { Paginated } from '../types';

/** Locale accepted by the `_locale` query parameter of the OOH endpoints. */
export type OohLocale = 'en' | 'ro' | 'hu' | 'bg';

/** Weekly opening schedule of a locker/OOH location. */
export interface LockerScheduleEntry {
  /** Day of week (0-6). */
  day: number;
  /** Hour:minutes format, e.g. `08:00`. */
  openingHour: string;
  /** Hour:minutes format, e.g. `20:00`. */
  closingHour: string;
}

/** Number of free/reserved/occupied boxes of a given size in a locker. */
export interface LockerBoxCount {
  size: string;
  number: number;
}

/** Filters accepted by `GET /api/client/lockers`. */
export type LockerFilters = {
  /** List with locker ids separated by comma. */
  lockersList?: string;
  /** The country ISO code with 2 digits. */
  countryCode?: string;
  /** Response locale (maps to the `_locale` query parameter). */
  _locale?: OohLocale;
  /** Page number (API default: 1). */
  page?: number;
  /** Number of results per page (API default: 500). */
  countPerPage?: number;
};

/** A locker returned by `GET /api/client/lockers`. */
export interface LockerLocation {
  name: string;
  country: string;
  countryId: number;
  county: string;
  countyId: number;
  city: string;
  cityId: number;
  address: string;
  postalCode: string;
  lat: number;
  lng: number;
  phone: string;
  email: string;
  clientVisible: number;
  lockerId: number;
  supportedPayment: number;
  excludedSellers: unknown[];
  deliveryLogisticLocationId: number;
  deliveryLogisticLocation: string;
  /** 0 -> free, 1 -> almost full, 2 -> full. */
  occupancyLevel: 0 | 1 | 2;
  lockerRoute: string;
  schedule: LockerScheduleEntry[];
  availableBoxes: LockerBoxCount[];
  reservedBoxes: LockerBoxCount[];
  occupiedBoxes: LockerBoxCount[];
}

/** Filters accepted by `GET /api/client/ooh-locations`. */
export type OohLocationFilters = {
  /** List with location ids separated by comma. */
  oohList?: string;
  /** 0 -> only locker locations; 1 -> all OOH (lockers + pudo) locations. */
  listingType?: 0 | 1;
  /** Number of results per page (API default: 100). */
  countPerPage?: number;
  /** The country ISO code with 2 digits. */
  countryCode?: string;
  /** Response locale (maps to the `_locale` query parameter). */
  _locale?: OohLocale;
  /** Page number to return. */
  page?: number;
}

/** Special (e.g. holiday) schedule entry of an OOH location. */
export interface OohSpecialScheduleEntry {
  day: number;
  month: number;
  freeDay: number;
  /** Hour:minutes format, e.g. `08:00`. */
  openingHour: string;
  /** Hour:minutes format, e.g. `20:00`. */
  closingHour: string;
}

/** An out-of-home (locker or pudo) location. */
export interface OohLocation {
  name: string;
  country: string;
  countryId: number;
  county: string;
  countyId: number;
  city: string;
  cityId: number;
  address: string;
  postalCode: string;
  lat: number;
  lng: number;
  phone: string | null;
  email: string | null;
  oohId: number;
  oohType: number;
  oohRoute: string;
  deliveryLogisticLocationId: number;
  deliveryLogisticLocation: string;
  clientVisible: number;
  capacityExceeded: number;
  supportedPayment: number;
  /** 0 -> free, 1 -> almost full, 2 -> full. */
  occupancyLevel: 0 | 1 | 2;
  schedule: LockerScheduleEntry[];
  specialSchedule: OohSpecialScheduleEntry[];
  photos: string[];
}

/** Lockers and out-of-home (locker/pudo) locations. */
export class OohResource {
  constructor(private readonly client: SamedayClient) {}

  /** `GET /api/client/lockers` — paginated list of all lockers. */
  getLockers(filters: LockerFilters = {}): Promise<Paginated<LockerLocation>> {
    return this.client.request<Paginated<LockerLocation>>({
      method: 'GET',
      path: '/api/client/lockers',
      query: { ...filters },
    });
  }

  /**
   * Walks every page of {@link getLockers}; see {@link iteratePaginated}. The
   * iterator controls page/countPerPage (use the options argument to
   * tune them).
   */
  iterateLockers(
    filters: LockerFilters = {},
    options?: IterateOptions,
  ): AsyncGenerator<LockerLocation, void, undefined> {
    return iteratePaginated(
      (page, countPerPage) => this.getLockers({ ...filters, page, countPerPage }),
      options,
    );
  }

  /** `GET /api/client/ooh-locations` — paginated list of all OOH locations. */
  getLocations(filters: OohLocationFilters = {}): Promise<Paginated<OohLocation>> {
    return this.client.request<Paginated<OohLocation>>({
      method: 'GET',
      path: '/api/client/ooh-locations',
      query: { ...filters },
    });
  }

  /**
   * Walks every page of {@link getLocations}; see {@link iteratePaginated}. The
   * iterator controls page/countPerPage (use the options argument to
   * tune them).
   */
  iterateLocations(
    filters: OohLocationFilters = {},
    options?: IterateOptions,
  ): AsyncGenerator<OohLocation, void, undefined> {
    return iteratePaginated(
      (page, countPerPage) => this.getLocations({ ...filters, page, countPerPage }),
      options,
    );
  }
}
