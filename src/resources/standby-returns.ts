import type { SamedayClient } from '../client';
import { iteratePaginated, type IterateOptions } from '../http/paginate';
import type { Paginated } from '../types';

/** Sortable fields of the standby returns list. */
export type StandbyReturnSortField =
  | 'seller'
  | 'awbNumber'
  | 'serviceId'
  | 'createdAt'
  | 'phone'
  | 'email'
  | 'status'
  | 'thirdPartyName';

/** Sort order of the standby returns list. */
export type StandbyReturnSortOrder = 'asc' | 'desc';

/** Filters accepted by `GET /api/client/standby-returns`. */
export type StandbyReturnsFilters = {
  /** Page number (API default: 1). */
  page?: number;
  /** Number of results per page (API default: 500). */
  countPerPage?: number;
  /** The seller id (integer values only). */
  seller?: number;
  /** AWB number (minimum 5 characters; partial match on the right). */
  awbNumber?: string;
  /** Service id (integer values only). */
  serviceId?: number;
  /** Start of the `created_at` interval (`yyyy-MM-dd HH:mm:ss`). */
  startInterval?: string;
  /**
   * End of the `created_at` interval (`yyyy-MM-dd HH:mm:ss`). Cannot be before
   * the start interval and the interval cannot be longer than three months.
   */
  endInterval?: string;
  /** Phone number (minimum 5 characters; partial match on the right). */
  phone?: string;
  /** Email (minimum 5 characters; partial match on the right). */
  email?: string;
  /** Third party name (minimum 5 characters; partial match on the right). */
  thirdPartyName?: string;
  /** Observation (minimum 5 characters; partial match on the right). */
  observation?: string;
  /** Sorting field. */
  sortBy?: StandbyReturnSortField;
  /** Sort order. */
  order?: StandbyReturnSortOrder;
};

/** A standby-return AWB. */
export interface StandbyReturnAwb {
  seller: string;
  awbNumber: string;
  serviceId: number;
  /** ISO date-time string. */
  createdAt: string;
  phone: string;
  email: string;
  status: number;
  thirdPartyName: string;
  observation: string;
}

/** Standby-return AWBs (parcels waiting to be returned to the client). */
export class StandbyReturnsResource {
  constructor(private readonly client: SamedayClient) {}

  /** `GET /api/client/standby-returns` — paginated list of standby-return AWBs. */
  list(filters: StandbyReturnsFilters = {}): Promise<Paginated<StandbyReturnAwb>> {
    return this.client.request<Paginated<StandbyReturnAwb>>({
      method: 'GET',
      path: '/api/client/standby-returns',
      query: { ...filters },
    });
  }

  /**
   * Walks every page of {@link list}; see {@link iteratePaginated}. The iterator
   * controls page/countPerPage (use the options argument to tune them).
   */
  iterate(
    filters: StandbyReturnsFilters = {},
    options?: IterateOptions,
  ): AsyncGenerator<StandbyReturnAwb, void, undefined> {
    return iteratePaginated(
      (page, countPerPage) => this.list({ ...filters, page, countPerPage }),
      options,
    );
  }
}
