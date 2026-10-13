import type { SamedayClient } from '../client';
import { iteratePaginated, type IterateOptions } from '../http/paginate';
import type { Paginated, SellerPaginationRequestType } from '../types';

/** One optional tax attached to a service. */
export interface ServiceOptionalTax {
  costType?: string;
  id?: number;
  name?: string;
  tax?: number;
  packageType?: number;
  taxCode?: string;
}

/** One row of the paginated `/api/client/services` response (inline schema). */
export interface ClientService {
  id?: number;
  name?: string;
  serviceCode?: string;
  deliveryType?: { id?: number; name?: string };
  defaultService?: boolean;
  serviceOptionalTaxes?: ServiceOptionalTax[];
}

/**
 * Delivery services catalogue.
 *
 * NOTE: per the spec, `GET /api/client/services` carries the pagination in a
 * `application/x-www-form-urlencoded` request BODY, not in query parameters.
 */
export class ServicesResource {
  constructor(private readonly client: SamedayClient) {}

  /** Lists services — `GET /api/client/services` (pagination sent as form body). */
  list(filters: SellerPaginationRequestType = {}): Promise<Paginated<ClientService>> {
    return this.client.request<Paginated<ClientService>>({
      method: 'GET',
      path: '/api/client/services',
      body: { ...filters },
    });
  }

  /** Walks every page of {@link ServicesResource.list}, yielding items one by one. */
  iterate(
    options?: IterateOptions,
  ): AsyncGenerator<ClientService, void, undefined> {
    return iteratePaginated(
      (page, countPerPage) => this.list({ page, countPerPage }),
      options,
    );
  }
}
