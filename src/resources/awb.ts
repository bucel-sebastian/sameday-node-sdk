import type { SamedayClient } from '../client';
import { iteratePaginated, type IterateOptions } from '../http/paginate';
import type {
  AwbParcelType2,
  AwbResponse,
  AwbType,
  AwbType2,
  AwbUpdateCodType,
  Paginated,
  SellerFormType,
} from '../types';

/** One `returnAwbs` entry of the estimate-cost response. */
export interface EstimateReturnAwb {
  awbCost?: number;
  serviceTaxId?: number;
}

/**
 * Inline response of `/api/awb/estimate-cost` (spec `oneOf`: a base quote with
 * or without the optional `returnAwbs` breakdown).
 */
export interface EstimateCostResponse {
  amount?: number;
  currency?: string;
  time?: number;
  returnAwbs?: EstimateReturnAwb[];
}

/** Inline response of `/api/awb/basic-estimate-cost`. */
export interface BasicEstimateCostResponse {
  amount?: number;
  currency?: string;
  time?: number;
}

/** A parcel for {@link AwbResource.basicEstimateCost} (spec requires all four dimensions). */
export interface BasicEstimateParcel {
  weight: number;
  width: number;
  length: number;
  height: number;
  awbParcelNumber?: string;
  forceOversized?: 0 | 1;
}

/** Query parameters of `GET /api/awb/basic-estimate-cost` (C2C estimate). */
export interface BasicEstimateCostParams {
  /** 0 -> package; 1 -> small package; 2 -> large package. */
  packageType: 0 | 1 | 2;
  packageWeight: number;
  service: number;
  cashOnDelivery: number;
  insuredValue: number;
  parcels: BasicEstimateParcel[];
  packageNumber?: number;
  serviceTaxes?: string[];
  deliveryInterval?:
    | 1
    | 2
    | 3
    | 4
    | 5
    | 6
    | 7
    | 8
    | 9
    | 10
    | 11
    | 12
    | 13
    | 14
    | 15;
  currency?: 'RON' | 'EUR' | 'HUF';
}

/** Filters accepted by {@link AwbResource.list}. */
export interface ClientAwbListFilters {
  page?: number;
  countPerPage?: number;
  startTimestamp?: string;
  endTimestamp?: string;
  /** 0 -> not printed, 1 -> printed. */
  isPrinted?: 0 | 1;
}

/** One row of the paginated `/api/client-awb-list` response (inline schema). */
export interface ClientAwbListItem {
  awbNumber?: string;
  parcelNumber?: string;
  awbCreatedBy?: string;
  awbCreated?: string;
  awbStatus?: string;
  parcelStatus?: string;
  serviceName?: string;
  packageType?: string;
  clientName?: string;
  aliasPickupPoint?: string;
  thirdPartyPickup?: string;
  thirdPartyAddress?: string;
  pickupPointAddress?: string;
  senderName?: string;
  senderCity?: string;
  senderCounty?: string;
  senderPhone?: string;
  senderEmail?: string;
  recipientName?: string;
  recipientAddress?: string;
  recipientCity?: string;
  recipientCounty?: string;
  recipientPhone?: string;
  recipientEmail?: string;
  observations?: string;
  priceObservations?: string;
  clientObservations?: string;
  clientReference?: string;
  cashOnDelivery?: number;
  isPrinted?: boolean;
}

/** Inline response of `POST /api/awb/{awbNumber}/parcel`. */
export interface AddParcelResponse {
  awbParcelNumber?: string;
}

/** Inline `{ success: { code, message } }` envelope returned by update-cod. */
export interface SuccessResponse {
  success?: { code?: number; message?: string };
}

/** Options for {@link AwbResource.downloadLabel} (defaults: A4/pdf/inline). */
export interface DownloadLabelOptions {
  format?: 'A4' | 'A6';
  contentType?: 'pdf' | 'html' | 'zpl';
  disposition?: 'inline' | 'attachment';
  resolution?: number;
}

/** Options for {@link AwbResource.downloadStandbyReturnLabel} (defaults: A4/pdf/inline). */
export interface DownloadStandbyReturnLabelOptions {
  format?: 'A4' | 'A6';
  contentType?: 'pdf' | 'html';
  disposition?: 'inline' | 'attachment';
}

/** Options for {@link AwbResource.downloadProofOfDelivery} (default: inline). */
export interface DownloadProofOfDeliveryOptions {
  disposition?: 'inline' | 'attachment';
}

/**
 * AWB (waybill) operations: create, estimate, fetch, cancel, mutate, list and
 * download documents.
 */
export class AwbResource {
  constructor(private readonly client: SamedayClient) {}

  /** Creates an AWB — `POST /api/awb`. */
  create(payload: AwbType): Promise<AwbResponse> {
    return this.client.request<AwbResponse>({
      method: 'POST',
      path: '/api/awb',
      body: { ...payload },
    });
  }

  /** Price estimate for a full AWB payload — `POST /api/awb/estimate-cost`. */
  estimateCost(payload: AwbType2): Promise<EstimateCostResponse> {
    return this.client.request<EstimateCostResponse>({
      method: 'POST',
      path: '/api/awb/estimate-cost',
      body: { ...payload },
    });
  }

  /**
   * Estimate cost for an existing AWB — `POST /api/awb/estimate-cost/{awbId}`.
   * Without a payload the spec says the estimate is taken from the database.
   */
  estimateCostForAwbId(
    awbId: number,
    payload?: AwbType2,
  ): Promise<EstimateCostResponse> {
    return this.client.request<EstimateCostResponse>({
      method: 'POST',
      path: `/api/awb/estimate-cost/${awbId}`,
      body: payload === undefined ? undefined : { ...payload },
    });
  }

  /**
   * C2C price estimate — `GET /api/awb/basic-estimate-cost`.
   * `parcels` is deepObject-encoded as `parcels[i][field]` query keys.
   */
  basicEstimateCost(params: BasicEstimateCostParams): Promise<BasicEstimateCostResponse> {
    const query: Record<string, unknown> = {
      packageType: params.packageType,
      packageNumber: params.packageNumber,
      packageWeight: params.packageWeight,
      service: params.service,
      cashOnDelivery: params.cashOnDelivery,
      insuredValue: params.insuredValue,
      serviceTaxes: params.serviceTaxes,
      deliveryInterval: params.deliveryInterval,
      currency: params.currency,
    };
    params.parcels.forEach((parcel, index) => {
      for (const [key, value] of Object.entries(parcel)) {
        query[`parcels[${index}][${key}]`] = value;
      }
    });
    return this.client.request<BasicEstimateCostResponse>({
      method: 'GET',
      path: '/api/awb/basic-estimate-cost',
      query,
    });
  }

  /** Fetches an AWB by client internal reference — `GET /api/client/awb/{clientInternalReference}`. */
  getByClientReference(clientInternalReference: string): Promise<AwbResponse> {
    return this.client.request<AwbResponse>({
      method: 'GET',
      path: `/api/client/awb/${encodeURIComponent(clientInternalReference)}`,
    });
  }

  /** Cancels an AWB by AWB or parcel number — `DELETE /api/awb/{awbOrParcelNumber}` (204). */
  cancel(awbOrParcelNumber: string, body?: SellerFormType): Promise<void> {
    return this.client.request<void>({
      method: 'DELETE',
      path: `/api/awb/${encodeURIComponent(awbOrParcelNumber)}`,
      body,
    });
  }

  /** Adds a parcel to an AWB — `POST /api/awb/{awbNumber}/parcel` (201). */
  addParcel(awbNumber: string, payload: AwbParcelType2): Promise<AddParcelResponse> {
    return this.client.request<AddParcelResponse>({
      method: 'POST',
      path: `/api/awb/${encodeURIComponent(awbNumber)}/parcel`,
      body: { ...payload },
    });
  }

  /** Updates the cash-on-delivery of an AWB — `PUT /api/awb/{awbNumber}/update-cod` (201). */
  updateCod(awbNumber: string, payload: AwbUpdateCodType): Promise<SuccessResponse> {
    return this.client.request<SuccessResponse>({
      method: 'PUT',
      path: `/api/awb/${encodeURIComponent(awbNumber)}/update-cod`,
      body: { ...payload },
    });
  }

  /**
   * Approves (`1`) or cancels (`0`) a standby return —
   * `PATCH /api/awb/{awbNumber}/standby?approve={approve}` (204).
   */
  activateStandbyReturn(
    awbNumber: string,
    approve: 0 | 1,
    body?: SellerFormType,
  ): Promise<void> {
    return this.client.request<void>({
      method: 'PATCH',
      path: `/api/awb/${encodeURIComponent(awbNumber)}/standby`,
      query: { approve },
      body,
    });
  }

  /** Lists client AWBs (max 24h between timestamps) — `GET /api/client-awb-list`. */
  list(filters: ClientAwbListFilters = {}): Promise<Paginated<ClientAwbListItem>> {
    return this.client.request<Paginated<ClientAwbListItem>>({
      method: 'GET',
      path: '/api/client-awb-list',
      query: { ...filters },
    });
  }

  /** Walks every page of {@link AwbResource.list}, yielding items one by one. */
  iterate(
    filters: Omit<ClientAwbListFilters, 'page' | 'countPerPage'> = {},
    options?: IterateOptions,
  ): AsyncGenerator<ClientAwbListItem, void, undefined> {
    return iteratePaginated(
      (page, countPerPage) => this.list({ ...filters, page, countPerPage }),
      options,
    );
  }

  /** Downloads the AWB label — `GET /api/awb/download/{awbNumber}/{format}/{contentType}/{disposition}`. */
  downloadLabel(awbNumber: string, options: DownloadLabelOptions = {}): Promise<Buffer> {
    const format = options.format ?? 'A4';
    const contentType = options.contentType ?? 'pdf';
    const disposition = options.disposition ?? 'inline';
    return this.client.request<Buffer>({
      method: 'GET',
      path: `/api/awb/download/${encodeURIComponent(awbNumber)}/${format}/${contentType}/${disposition}`,
      query: { resolution: options.resolution },
      responseType: 'binary',
    });
  }

  /**
   * Downloads the standby-return document —
   * `GET /api/awb/download-standby-return/{awbNumber}/{format}/{contentType}/{disposition}`.
   */
  downloadStandbyReturnLabel(
    awbNumber: string,
    options: DownloadStandbyReturnLabelOptions = {},
  ): Promise<Buffer> {
    const format = options.format ?? 'A4';
    const contentType = options.contentType ?? 'pdf';
    const disposition = options.disposition ?? 'inline';
    return this.client.request<Buffer>({
      method: 'GET',
      path: `/api/awb/download-standby-return/${encodeURIComponent(awbNumber)}/${format}/${contentType}/${disposition}`,
      responseType: 'binary',
    });
  }

  /** Downloads the proof of delivery — `GET /api/awb/{awbNumber}/proof-of-delivery/{disposition}`. */
  downloadProofOfDelivery(
    awbNumber: string,
    options: DownloadProofOfDeliveryOptions = {},
  ): Promise<Buffer> {
    const disposition = options.disposition ?? 'inline';
    return this.client.request<Buffer>({
      method: 'GET',
      path: `/api/awb/${encodeURIComponent(awbNumber)}/proof-of-delivery/${disposition}`,
      responseType: 'binary',
    });
  }
}
