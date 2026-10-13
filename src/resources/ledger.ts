// Explicitly pull in Node's type definitions: this module exposes `Buffer`
// in its public signatures (same reasoning as http/request.ts for the dts
// build, which does not discover `@types` automatically).
/// <reference types="node" />

import type { SamedayClient } from '../client';
import type { ClientCodTransferredLedgersExportRequest } from '../types';

/** Date-range filter for the COD ledger download (`yyyy-MM-dd` strings). */
export type CodLedgerFilters = {
  /** Start date of the ledger interval (maximum interval: 31 days). */
  startDate?: string;
  /** End date of the ledger interval (maximum interval: 31 days). */
  endDate?: string;
};

/** File disposition accepted by the invoice ledger download path parameter. */
export type LedgerDisposition = 'attachment' | 'inline';

/** COD ledgers, transferred-ledger exports and invoice ledger downloads. */
export class LedgerResource {
  constructor(private readonly client: SamedayClient) {}

  /**
   * `GET /api/client/cod-ledger-download` — downloads (CSV) the AWBs from
   * ledgers created between two dates for the current client.
   */
  downloadCodLedger(filters: CodLedgerFilters = {}): Promise<Buffer> {
    return this.client.request<Buffer>({
      method: 'GET',
      path: '/api/client/cod-ledger-download',
      query: { ...filters },
      responseType: 'binary',
    });
  }

  /**
   * `GET /api/client/cod-transferred-ledgers-export` — downloads (CSV) the
   * transferred COD ledgers export for the given date interval. NOTE: the spec
   * declares `startDate`/`endDate` as required *query* parameters (there is no
   * request body), so the typed request is forwarded as the query string.
   */
  validateTransferredLedgers(request: ClientCodTransferredLedgersExportRequest): Promise<Buffer> {
    return this.client.request<Buffer>({
      method: 'GET',
      path: '/api/client/cod-transferred-ledgers-export',
      query: { startDate: request.startDate, endDate: request.endDate },
      responseType: 'binary',
    });
  }

  /**
   * `GET /api/client/download-ledger-for-invoice/{invoiceBillingNumber}/{disposition}`
   * — downloads the aggregated ledgers of an invoice.
   */
  downloadInvoiceLedger(
    invoiceBillingNumber: string,
    disposition: LedgerDisposition = 'attachment',
  ): Promise<Buffer> {
    return this.client.request<Buffer>({
      method: 'GET',
      path: `/api/client/download-ledger-for-invoice/${encodeURIComponent(
        invoiceBillingNumber,
      )}/${disposition}`,
      responseType: 'binary',
    });
  }
}
