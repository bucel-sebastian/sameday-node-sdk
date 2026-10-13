/**
 * Hand-written helper types shared across the SDK (not present in the spec),
 * plus small generic spec schemas that do not belong to a single domain.
 */

/** A page of results returned by the paginated list endpoints. */
export type Paginated<T> = {
  total: number;
  currentPage: number;
  pages: number;
  perPage: number;
  data: T[];
};

/** Successful response of the authentication endpoint. */
export type AuthResponse = {
  token: string;
  /** ISO date-time string. */
  expire_at: string;
  /** ISO date-time string. */
  expire_at_utc: string;
};

/** Error body returned by the API on failed requests (e.g. 403 responses). */
export type ApiErrorEnvelope = {
  error: {
    code: number;
    message: string;
  };
};

/** Deployment environment of the Sameday API. */
export type SamedayEnvironment = "prod" | "demo";

/** Request body for exporting the COD transferred ledgers. */
export interface ClientCodTransferredLedgersExportRequest {
  startDate: string;
  endDate: string;
}

/** Pagination parameters accepted by the seller/list endpoints. */
export interface SellerPaginationRequestType {
  /** Page number. Default: 1. */
  page?: number;
  /** Number of results per page. Default: 500. */
  countPerPage?: number;
}

/** Freeform form payload; the spec declares an object without properties. */
export type SellerFormType = Record<string, unknown>;
