import type { SamedayClient } from '../client';
import { iteratePaginated, type IterateOptions } from '../http/paginate';
import type {
  ContactPersonType,
  NonMandatoryPickupPointType,
  Paginated,
  PickupPointType,
} from '../types';

/** Filters accepted by {@link PickupPointsResource.list}. */
export interface PickupPointListFilters {
  page?: number;
  countPerPage?: number;
}

/** Contact-person details returned by `POST /api/client/pickup-points`. */
export interface PickupPointContactPerson {
  id?: number;
  name?: string;
}

/** Inline response of `POST /api/client/pickup-points` (snake_case in the spec). */
export interface CreatePickupPointResponse {
  id?: number;
  contact_persons?: PickupPointContactPerson;
}

/** Inline response of `POST /api/client/pickup-points/{idPickupPoint}/contact-person`. */
export interface AddContactPersonResponse {
  id?: number;
}

/** One row of the paginated `/api/client/pickup-points` response (inline schema). */
export interface PickupPointListItem {
  country?: { id?: number; name?: string; code?: string };
  id?: number;
  county?: { id?: number; name?: string; code?: string };
  city?: {
    samedayDeliveryAgency?: string | null;
    samedayPickupAgency?: string | null;
    id?: number;
    name?: string;
    extraKM?: number | null;
  };
  address?: string;
  postalCode?: string;
  defaultPickupPoint?: boolean;
  pickupPointContactPerson?: {
    id?: number;
    name?: string;
    position?: string;
    phoneNumber?: string;
    email?: string;
    defaultContactPerson?: boolean;
    /** Only for the BG instance. */
    nationality?: string;
    /** Only for the BG instance. */
    nationalID?: string;
  };
  alias?: string;
  cutOff?: string;
  deliveryInterval?: string;
  status?: boolean;
}

/** Client pickup-point management (list, create, edit, delete, contact persons). */
export class PickupPointsResource {
  constructor(private readonly client: SamedayClient) {}

  /** Lists pickup points — `GET /api/client/pickup-points`. */
  list(
    filters: PickupPointListFilters = {},
  ): Promise<Paginated<PickupPointListItem>> {
    return this.client.request<Paginated<PickupPointListItem>>({
      method: 'GET',
      path: '/api/client/pickup-points',
      query: { ...filters },
    });
  }

  /** Walks every page of {@link PickupPointsResource.list}, yielding items one by one. */
  iterate(
    options?: IterateOptions,
  ): AsyncGenerator<PickupPointListItem, void, undefined> {
    return iteratePaginated(
      (page, countPerPage) => this.list({ page, countPerPage }),
      options,
    );
  }

  /** Creates a pickup point — `POST /api/client/pickup-points` (201). */
  create(payload: PickupPointType): Promise<CreatePickupPointResponse> {
    return this.client.request<CreatePickupPointResponse>({
      method: 'POST',
      path: '/api/client/pickup-points',
      body: { ...payload },
    });
  }

  /** Updates mutable fields of a pickup point — `PATCH /api/client/pickup-points/{pickupPointId}` (204). */
  edit(pickupPointId: string, payload: NonMandatoryPickupPointType): Promise<void> {
    return this.client.request<void>({
      method: 'PATCH',
      path: `/api/client/pickup-points/${encodeURIComponent(pickupPointId)}`,
      body: { ...payload },
    });
  }

  /** Deletes a pickup point — `DELETE /api/client/pickup-points/{idPickupPoint}` (204). */
  delete(idPickupPoint: number): Promise<void> {
    return this.client.request<void>({
      method: 'DELETE',
      path: `/api/client/pickup-points/${idPickupPoint}`,
    });
  }

  /** Adds a contact person — `POST /api/client/pickup-points/{idPickupPoint}/contact-person` (201). */
  addContactPerson(
    idPickupPoint: number,
    payload: ContactPersonType,
  ): Promise<AddContactPersonResponse> {
    return this.client.request<AddContactPersonResponse>({
      method: 'POST',
      path: `/api/client/pickup-points/${idPickupPoint}/contact-person`,
      body: { ...payload },
    });
  }
}
