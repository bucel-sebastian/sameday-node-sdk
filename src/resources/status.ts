import type { SamedayClient } from '../client';
import { iteratePaginated, type IterateOptions } from '../http/paginate';
import type { Paginated, ParcelUpdateStatusRequestType } from '../types';

/** Filters accepted by the four status-sync endpoints. */
export type StatusSyncFilters = {
  /** Start of the interval (ISO timestamp). The maximum interval is 2 hours. */
  startTimestamp: string;
  /** End of the interval (ISO timestamp). The maximum interval is 2 hours. */
  endTimestamp: string;
  /** Page number (API default: 1). */
  page?: number;
  /** Number of results per page (API default: 500). */
  countPerPage?: number;
};

/** Filters accepted by `GET /api/public/status-list`. */
export type StatusListFilters = {
  /** Filter by (partial) status name. */
  name?: string;
  /** Page number (API default: 1). */
  page?: number;
  /** Number of results per page (API default: 500). */
  countPerPage?: number;
};

/** Filters accepted by `GET /api/logistic-flow/status-reason`. */
export type StatusReasonFilters = {
  /** Filter by (partial) reason name. */
  name?: string;
  /** Filter by status id the reason belongs to. */
  status?: number;
  /** Page number (API default: 1). */
  page?: number;
  /** Number of results per page (API default: 500). */
  countPerPage?: number;
};

/** Locker details attached to a status transition of a locker parcel. */
export interface StatusSyncLockerDetails {
  consolidationHash?: string;
  dischargeDate?: string;
  dischargeClientCode?: string;
  lockerId?: number;
}

/** Out-of-home details attached to a status transition of an OOH parcel. */
export interface StatusSyncOohDetails {
  consolidationHash?: string;
  dischargeDate?: string;
  dischargeClientCode?: string;
  oohId?: number;
  oohType?: number;
}

/** A single status transition returned by the status-sync endpoints. */
export interface StatusSyncEntry {
  status: string;
  statusId: number;
  statusLabel: string;
  statusState: string;
  transitLocation: string;
  /** ISO date-time string. */
  statusDate: string;
  parcelAwbNumber: string;
  createdBy: number;
  reasonId: number;
  reason: string;
  inReturn: boolean;
  itemsNo: number;
  lockerDetails?: StatusSyncLockerDetails;
  oohDetails?: StatusSyncOohDetails;
  parcelDetails?: string;
  damageCheck?: { id: number; label: string };
  /** 0 -> not verified yet, 1 -> verified (recipient is over 18), 2 -> verification failed. */
  tobaccoCheck?: 0 | 1 | 2;
  /** Only returned by the marketplace status-sync endpoints. */
  marketplaceId?: number;
  /** Only returned by the marketplace status-sync endpoints. */
  sellerId?: string;
  location?: { logisticLocationId: number; logisticLocationName: string } | null;
  parcelMeasurements?: {
    measuredWeight?: number | null;
    volumetricWeight?: number | null;
    measuredWidth?: number | null;
    measuredLength?: number | null;
    measuredHeight?: number | null;
    chargeableWeight?: number | null;
  } | null;
  /** Present when `send_courier_coordinates = 1`; null when no coordinates were recorded. */
  courierCoordinates?: { latitude: string; longitude: string } | null;
}

/**
 * Page of status transitions returned by the status-sync endpoints. NOTE: the
 * spec declares only `currentPage`, `perPage` and `data` for these endpoints
 * (no `total`/`pages`), so this deliberately differs from {@link Paginated}.
 */
export interface StatusSyncPage {
  currentPage: number;
  perPage: number;
  data: StatusSyncEntry[];
}

/** A status visible on the status-list endpoint. */
export interface StatusListItem {
  id: number;
  label: string;
  reasons: Array<{ id: number; name: string }>;
}

/** A status reason returned by the status-reason endpoint. */
export interface StatusReasonItem {
  id: number;
  name: string;
  /** Id of the status this reason belongs to. */
  status: number;
}

/** Envelope returned by `PUT /api/parcel/{parcelAwbNumber}/update-status`. */
export interface StatusUpdateResponse {
  success: { code: number; message: string };
}

/** Status transitions, parcel status updates and the status/reason catalogs. */
export class StatusResource {
  constructor(private readonly client: SamedayClient) {}

  /**
   * `GET /api/client/status-sync` — status transitions between two timestamps
   * for the current client (maximum interval: 2 hours).
   */
  sync(filters: StatusSyncFilters): Promise<StatusSyncPage> {
    return this.client.request<StatusSyncPage>({
      method: 'GET',
      path: '/api/client/status-sync',
      query: { ...filters },
    });
  }

  /**
   * `GET /api/client/mkt-status-sync` — status transitions between two
   * timestamps for the current marketplace (maximum interval: 2 hours).
   */
  syncMarketplace(filters: StatusSyncFilters): Promise<StatusSyncPage> {
    return this.client.request<StatusSyncPage>({
      method: 'GET',
      path: '/api/client/mkt-status-sync',
      query: { ...filters },
    });
  }

  /**
   * `GET /api/client/xb-status-sync` — cross-border status transitions between
   * two timestamps for the current client (maximum interval: 2 hours).
   */
  syncCrossBorder(filters: StatusSyncFilters): Promise<StatusSyncPage> {
    return this.client.request<StatusSyncPage>({
      method: 'GET',
      path: '/api/client/xb-status-sync',
      query: { ...filters },
    });
  }

  /**
   * `GET /api/client/mkt-xb-status-sync` — cross-border status transitions
   * between two timestamps for the current marketplace (maximum interval: 2
   * hours).
   */
  syncCrossBorderMarketplace(filters: StatusSyncFilters): Promise<StatusSyncPage> {
    return this.client.request<StatusSyncPage>({
      method: 'GET',
      path: '/api/client/mkt-xb-status-sync',
      query: { ...filters },
    });
  }

  /**
   * `GET /api/public/status-list` — paginated list of available statuses.
   * Returns the client-visible statuses when the request is authenticated, or
   * the public statuses list when it is not.
   */
  list(filters: StatusListFilters = {}): Promise<Paginated<StatusListItem>> {
    return this.client.request<Paginated<StatusListItem>>({
      method: 'GET',
      path: '/api/public/status-list',
      query: { ...filters },
    });
  }

  /**
   * Walks every page of {@link list}; see {@link iteratePaginated}. The iterator
   * controls page/countPerPage (use the options argument to tune them).
   */
  iterateStatuses(
    filters: StatusListFilters = {},
    options?: IterateOptions,
  ): AsyncGenerator<StatusListItem, void, undefined> {
    return iteratePaginated(
      (page, countPerPage) => this.list({ ...filters, page, countPerPage }),
      options,
    );
  }

  /** `GET /api/logistic-flow/status-reason` — paginated list of status reasons. */
  reasons(filters: StatusReasonFilters = {}): Promise<Paginated<StatusReasonItem>> {
    return this.client.request<Paginated<StatusReasonItem>>({
      method: 'GET',
      path: '/api/logistic-flow/status-reason',
      query: { ...filters },
    });
  }

  /**
   * Walks every page of {@link reasons}; see {@link iteratePaginated}. The
   * iterator controls page/countPerPage (use the options argument to
   * tune them).
   */
  iterateReasons(
    filters: StatusReasonFilters = {},
    options?: IterateOptions,
  ): AsyncGenerator<StatusReasonItem, void, undefined> {
    return iteratePaginated(
      (page, countPerPage) => this.reasons({ ...filters, page, countPerPage }),
      options,
    );
  }

  /**
   * `PUT /api/parcel/{parcelAwbNumber}/update-status` — updates the status of
   * a parcel (e.g. handed over to the courier or returned to the client
   * warehouse).
   */
  updateParcelStatus(
    parcelAwbNumber: string,
    payload: ParcelUpdateStatusRequestType,
  ): Promise<StatusUpdateResponse> {
    return this.client.request<StatusUpdateResponse>({
      method: 'PUT',
      path: `/api/parcel/${encodeURIComponent(parcelAwbNumber)}/update-status`,
      // Spread into a fresh object literal: `ParcelUpdateStatusRequestType` is
      // an interface, which is not assignable to (nor castable to) a
      // `Record<string, unknown>` index-signature type.
      body: { ...payload },
    });
  }
}
