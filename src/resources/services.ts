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
 * NOTE: the OpenAPI spec declares the pagination for `GET /api/client/services`
 * as an `application/x-www-form-urlencoded` request BODY, but the Fetch
 * standard forbids bodies on GET/HEAD requests (undici throws
 * `TypeError: Request with GET/HEAD method cannot have body`). Pagination is
 * therefore sent as query parameters, which the API accepts.
 */
export class ServicesResource {
  constructor(private readonly client: SamedayClient) {}

  /** Lists services — `GET /api/client/services` (pagination via query params). */
  list(filters: SellerPaginationRequestType = {}): Promise<Paginated<ClientService>> {
    return this.client.request<Paginated<ClientService>>({
      method: 'GET',
      path: '/api/client/services',
      query: { ...filters },
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
