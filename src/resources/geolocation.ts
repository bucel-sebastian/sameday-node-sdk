import type { SamedayClient } from '../client';
import { iteratePaginated, type IterateOptions } from '../http/paginate';
import type { Paginated } from '../types';

/** Filters accepted by {@link GeolocationResource.cities}. */
export interface CityFilters {
  name?: string;
  /** County the city belongs to. */
  county?: string;
  postalCode?: string;
  /** Two-letter ISO country code (e.g. `RO`). */
  countryCode?: string;
  page?: number;
  countPerPage?: number;
  /** Include per-service delivery agency details. */
  details?: boolean;
}

/** Filters accepted by {@link GeolocationResource.counties}. */
export interface CountyFilters {
  name?: string;
  /** Two-letter ISO country code (e.g. `RO`). */
  countryCode?: string;
  page?: number;
  countPerPage?: number;
}

/** One row of the paginated `/api/geolocation/city` response (inline schema). */
export interface City {
  samedayDeliveryAgencyId?: number;
  samedayDeliveryAgency?: string;
  samedayPickupAgency?: string;
  nextDayDeliveryAgencyId?: number;
  nextDayDeliveryAgency?: string;
  nextDayPickupAgency?: string;
  whiteDeliveryAgencyId?: number;
  whiteDeliveryAgency?: string;
  whitePickupAgency?: string;
  logisticCircle?: string;
  country?: { id?: number; name?: string; code?: string };
  id?: number;
  name?: string;
  extraKM?: number;
  village?: string;
  postalCode?: string;
  county?: { name?: string; id?: number; code?: string };
}

/** One row of the paginated `/api/geolocation/county` response (inline schema). */
export interface County {
  countryId?: number;
  country?: string;
  id?: number;
  name?: string;
  code?: string;
}

/** Geolocation lookups: cities and counties. */
export class GeolocationResource {
  constructor(private readonly client: SamedayClient) {}

  /** Lists cities — `GET /api/geolocation/city`. */
  cities(filters: CityFilters = {}): Promise<Paginated<City>> {
    return this.client.request<Paginated<City>>({
      method: 'GET',
      path: '/api/geolocation/city',
      query: { ...filters },
    });
  }

  /** Walks every page of {@link GeolocationResource.cities}, yielding items one by one. */
  iterateCities(
    filters: Omit<CityFilters, 'page' | 'countPerPage'> = {},
    options?: IterateOptions,
  ): AsyncGenerator<City, void, undefined> {
    return iteratePaginated(
      (page, countPerPage) => this.cities({ ...filters, page, countPerPage }),
      options,
    );
  }

  /** Lists counties — `GET /api/geolocation/county`. */
  counties(filters: CountyFilters = {}): Promise<Paginated<County>> {
    return this.client.request<Paginated<County>>({
      method: 'GET',
      path: '/api/geolocation/county',
      query: { ...filters },
    });
  }

  /** Walks every page of {@link GeolocationResource.counties}, yielding items one by one. */
  iterateCounties(
    filters: Omit<CountyFilters, 'page' | 'countPerPage'> = {},
    options?: IterateOptions,
  ): AsyncGenerator<County, void, undefined> {
    return iteratePaginated(
      (page, countPerPage) => this.counties({ ...filters, page, countPerPage }),
      options,
    );
  }
}
