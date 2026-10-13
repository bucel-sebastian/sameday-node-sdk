import type { SamedayClient } from '../client';

/** Filters accepted by `GET /api/client/uit-code-sync`. */
export type UitCodeSyncFilters = {
  /** Page number (API default: 1). */
  page?: number;
  /** Number of results per page (API default: 500). */
  countPerPage?: number;
  /** Starting date for the count (maximum interval: 2 days). */
  startTimestamp?: string;
  /** Ending date for the count (maximum interval: 2 days). */
  endTimestamp?: string;
};

/** A single UIT-code registration of a parcel transport. */
export interface UitCodeHistoryEntry {
  registrationNumber: string;
  uitCode: string;
  /** Date string. */
  createdDate: string;
}

/** UIT-code transport history of a parcel. */
export interface UitCodeSyncEntry {
  parcelNumber: string;
  history: UitCodeHistoryEntry[];
}

/**
 * Page of UIT-code transports returned by the UIT-code-sync endpoint. NOTE:
 * the spec declares only `currentPage`, `perPage` and `data` for this
 * endpoint (no `total`/`pages`), so this deliberately differs from
 * `Paginated<T>`.
 */
export interface UitCodeSyncPage {
  currentPage: number;
  perPage: number;
  data: UitCodeSyncEntry[];
}

/** Payload accepted by `PATCH /api/awb/{parcelNumber}/uit-code`. */
export type UitCodeSavePayload = {
  /** UIT code of the parcel transport. */
  uitCode?: string;
  /** Registration number of the parcel transport. */
  registrationNumber?: string;
};

/** Envelope returned when saving a parcel's UIT-code transport information. */
export interface UitCodeSaveResponse {
  success: { code: number; message: string };
}

/** UIT-code synchronization: reading transports and saving parcel UIT codes. */
export class UitCodesResource {
  constructor(private readonly client: SamedayClient) {}

  /**
   * `GET /api/client/uit-code-sync` — paginated list of parcel transports
   * (UIT-code history) for the current client (maximum interval: 2 days).
   */
  sync(filters: UitCodeSyncFilters = {}): Promise<UitCodeSyncPage> {
    return this.client.request<UitCodeSyncPage>({
      method: 'GET',
      path: '/api/client/uit-code-sync',
      query: { ...filters },
    });
  }

  /**
   * `PATCH /api/awb/{parcelNumber}/uit-code` — saves the UIT-code transport
   * information of a parcel.
   */
  saveUitCode(parcelNumber: string, payload: UitCodeSavePayload): Promise<UitCodeSaveResponse> {
    return this.client.request<UitCodeSaveResponse>({
      method: 'PATCH',
      path: `/api/awb/${encodeURIComponent(parcelNumber)}/uit-code`,
      body: payload as Record<string, unknown>,
    });
  }
}
