/**
 * The spec declares this schema as an empty array (`"union": []`) — i.e. it is
 * untyped. The fields referencing it are ids, which in practice may arrive as a
 * string, a number, or null.
 */
export type union = string | number | null;

/** Friendlier alias for {@link union}: an id-like value that may be a string, a number, or null. */
export type IdValue = union;

export interface ClientOrderType {
  /** ISO date-time string. */
  eligibilityDate?: string;
}

export interface ClientOohOrderType {
  /** ISO date-time string. */
  eligibilityDate?: string;
}

export interface AwbTermsAndConditionsType {
  ip?: string;
  date?: string;
}

export interface AwbThirdPartyType {
  name?: string;
  phoneNumber?: string;
  personType?: 0 | 1;
  companyName?: string;
  companyCui?: string;
  companyOnrcNumber?: string;
  companyIban?: string;
  companyBank?: string;
  postalCode?: string;
  address?: string;
  county?: string;
  city?: string;
  contactEmail?: string;
  wantsInvoice?: 0 | 1;
  service: number;
  countyString?: string;
  cityString?: string;
}

export interface AwbRecipientType {
  name: string;
  phoneNumber: string;
  personType: 0 | 1;
  companyName?: string;
  companyCui?: string;
  companyOnrcNumber?: string;
  companyIban?: string;
  companyBank?: string;
  postalCode: string;
  address: string;
  county: string;
  city: string;
  email: string;
  service: number;
  countyString?: string;
  cityString?: string;
}

export interface AwbParcelType {
  /** Parcel's weight (kg). */
  weight: number;
  /** Parcel's width (cm). */
  width?: number;
  /** Parcel's length (cm). */
  length?: number;
  /** Parcel's height (cm). */
  height?: number;
  /** The custom parcel number. */
  awbParcelNumber?: string;
  /**
   * Treat the parcel as oversized regardless of dimensions:
   * 0 -> consider dimensions; 1 -> ignore dimensions.
   */
  forceOversized?: 0 | 1;
  /** Client return pickup point ID. */
  returnLocationId?: string;
  /** Whether this parcel is the last of the expedition (0 -> false, 1 -> true). */
  isLast?: boolean;
  /** Flag that indicates the source of the parcel. */
  parcelSource?: number;
  /** Platform source of the parcel. */
  platformSource?: string;
}

export interface AwbParcelType2 {
  /** Parcel's weight (kg). */
  weight: number;
  /** Parcel's width (cm). */
  width?: number;
  /** Parcel's length (cm). */
  length?: number;
  /** Parcel's height (cm). */
  height?: number;
  /** The custom parcel number. */
  awbParcelNumber?: string;
  /**
   * Treat the parcel as oversized regardless of dimensions:
   * 0 -> consider dimensions; 1 -> ignore dimensions.
   */
  forceOversized?: 0 | 1;
  /** Client return pickup point ID. */
  returnLocationId?: string;
  /** Whether this parcel is the last of the expedition (0 -> false, 1 -> true). */
  isLast?: boolean;
  /** Flag that indicates the source of the parcel. */
  parcelSource?: number;
  /** Platform source of the parcel. */
  platformSource?: string;
  /** Parcel's position from expedition. */
  position: number;
  /** Parcel observation. */
  observation?: string;
  /** Parcel price observation. */
  priceObservation?: string;
}

export interface AwbParcelType3 {
  /** Parcel's weight (kg). */
  weight: number;
  /** Parcel's width (cm). */
  width?: number;
  /** Parcel's length (cm). */
  length?: number;
  /** Parcel's height (cm). */
  height?: number;
  /** The custom parcel number. */
  awbParcelNumber?: string;
  /**
   * Treat the parcel as oversized regardless of dimensions:
   * 0 -> consider dimensions; 1 -> ignore dimensions.
   */
  forceOversized?: 0 | 1;
}

export interface AwbType {
  /** Client pickup point ID (see /api/client/pickup-points). */
  pickupPoint: string;
  /** Client return pickup point ID. */
  returnLocationId?: string;
  /** Client contact person ID (see /api/client/pickup-points). */
  contactPerson?: string;
  /** Package type: 0 -> package, 1 -> small package, 2 -> large package. Default: 1. */
  packageType: 0 | 1 | 2;
  /** Number of packages; if missing, the awb is considered incomplete. */
  packageNumber?: number;
  /** Total package weight (kg). */
  packageWeight: number;
  /** Service ID (see /api/client/services). */
  service: string;
  /** AWB payment (who pays): 1 -> client. */
  awbPayment: 1;
  /** Cash on delivery (can be 0). */
  cashOnDelivery: number;
  /** Who collects the cash on delivery amount; default 1 -> COD collected by the client. */
  cashOnDeliveryReturns?: 0 | 1;
  /** Insured value for awb (all packages). */
  insuredValue: number;
  /**
   * Pickup from a third party, not one of the client's pickup points:
   * 1 -> third party pickup, 0 -> otherwise. Default: 1.
   */
  thirdPartyPickup: 0 | 1;
  /** Will become mandatory if the expedition is picked up from a third party. */
  thirdParty?: AwbThirdPartyType;
  /** Optional field; specific for certain clients (see /api/client/services). */
  serviceTaxes?: string[];
  /**
   * Delivery interval code; the time slot depends on the service.
   * 3H: 1 -> 10:00 - 13:00, 2 -> 14:00 - 17:00, 3 -> 19:00 - 22:00.
   * 2H: 4 -> 09:00 - 11:00, 5 -> 11:00 - 13:00, 6 -> 13:00 - 15:00, 7 -> 15:00 - 17:00,
   * 8 -> 17:00 - 19:00, 9 -> 19:00 - 21:00, 10 -> 13:00 - 16:00, 11 -> 15:00 - 18:00.
   * 6H: 12 -> 13:00 - 18:00, 13 -> 18:00 - 22:00.
   * 2H Pc Garage: 14 -> 18:00 - 20:00, 15 -> 20:00 - 22:00.
   */
  deliveryInterval?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15;
  awbRecipient: AwbRecipientType;
  /** Optional; client internal reference (invoice number, order) — displayed in the COD ledger. */
  clientInternalReference?: string;
  /** Package details; only the weight is mandatory, providing all the others is recommended. */
  parcels: AwbParcelType[];
  /** Optional; awb observations. */
  observation?: string;
  /** Optional; price observations. */
  priceObservation?: string;
  /** The flag that the client allows the redirection from home to locker to be done. */
  lockerRedirectEligible?: 0 | 1;
  /** Optional field used for C2C and locker return type services. */
  lockerFirstMile: number;
  /** Mandatory field only for C2C and locker delivery type services. */
  lockerLastMile: number;
  /** Optional field used for outOfHome first mile location (>= 500k pudo, < 500k locker). */
  oohFirstMile: number;
  /** Optional field used for outOfHome last mile location (>= 500k pudo, < 500k locker). */
  oohLastMile: number;
  clientId?: string;
  orderNumber?: string;
  returnLockerParcel: ClientOrderType;
  clientOohParcel: ClientOohOrderType;
  /** Non-EU tax code. Format: "<ISO country code> | H7: TRUE or FALSE". */
  nonEuTaxCode?: string;
  /** Optional; other client observations. */
  clientObservation?: string;
  /**
   * Optional; sent only if the client wants to manage the barcode generation for
   * parcels and awbs. NOT RECOMMENDED — auto generated by Sameday when absent.
   */
  awbNumber?: string;
  /** Deprecated for locker type services; use lockerFirstMile and lockerLastMile instead. */
  lockerId: number;
  /**
   * Optional; sent only by Dante to mark an AWB as 1P or 2P.
   * 1 -> Dante AWB; 2 -> third party AWB.
   */
  fulfillmentType: number;
  geniusOrder: 0 | 1;
  /** Date used for genius AWB (ISO date-time string). */
  orderDate?: string;
  /** Pick up start date for return operation (ISO date-time string). */
  pickupStartDate?: string;
  /** Pick up end date for return operation (ISO date-time string). */
  pickupEndDate?: string;
  /** Rabla return AWBs. */
  returnAwbs: string[];
  optionalPickupReturns?: 0 | 1;
  forwardedTC?: AwbTermsAndConditionsType;
  /** The flag for awb return in standby. */
  standbyReturn?: 0 | 1;
  /** Optional broker out-of-home destination id used for HU broker locker flow. */
  brokerOohLastMile?: string;
}

export interface AwbType2 {
  /** Client pickup point ID (see /api/client/pickup-points). */
  pickupPoint: string;
  /** Client return pickup point ID. */
  returnLocationId?: string;
  /** Client contact person ID (see /api/client/pickup-points). */
  contactPerson?: string;
  /** Package type: 0 -> package, 1 -> small package, 2 -> large package. Default: 1. */
  packageType: 0 | 1 | 2;
  /** Number of packages; if missing, the awb is considered incomplete. */
  packageNumber?: number;
  /** Total package weight (kg). */
  packageWeight: number;
  /** Service ID (see /api/client/services). */
  service: string;
  /** AWB payment (who pays): 1 -> client. */
  awbPayment: 1;
  /** Cash on delivery (can be 0). */
  cashOnDelivery: number;
  /** Who collects the cash on delivery amount; default 1 -> COD collected by the client. */
  cashOnDeliveryReturns?: 0 | 1;
  /** Insured value for awb (all packages). */
  insuredValue: number;
  /**
   * Pickup from a third party, not one of the client's pickup points:
   * 1 -> third party pickup, 0 -> otherwise. Default: 1.
   */
  thirdPartyPickup: 0 | 1;
  /** Will become mandatory if the expedition is picked up from a third party. */
  thirdParty?: AwbThirdPartyType;
  /** Optional field; specific for certain clients (see /api/client/services). */
  serviceTaxes?: string[];
  /**
   * Delivery interval code; the time slot depends on the service.
   * 3H: 1 -> 10:00 - 13:00, 2 -> 14:00 - 17:00, 3 -> 19:00 - 22:00.
   * 2H: 4 -> 09:00 - 11:00, 5 -> 11:00 - 13:00, 6 -> 13:00 - 15:00, 7 -> 15:00 - 17:00,
   * 8 -> 17:00 - 19:00, 9 -> 19:00 - 21:00, 10 -> 13:00 - 16:00, 11 -> 15:00 - 18:00.
   * 6H: 12 -> 13:00 - 18:00, 13 -> 18:00 - 22:00.
   * 2H Pc Garage: 14 -> 18:00 - 20:00, 15 -> 20:00 - 22:00.
   */
  deliveryInterval?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15;
  awbRecipient: AwbRecipientType;
  /** Package details; only the weight is mandatory, providing all the others is recommended. */
  parcels: AwbParcelType3[];
  /** Optional; awb observations. */
  observation?: string;
  /** Optional; price observations. */
  priceObservation?: string;
}

export interface AwbUpdateCodType {
  /** The cash on delivery. */
  cashOnDelivery: number;
}

export interface AwbResponse {
  awbNumber?: string;
  awbCost?: number;
  pdfLink?: string;
  pickupLogisticLocation?: string;
  deliveryLogisticLocation?: string;
  deliveryLogisticCircle?: string;
  sortingHub?: string;
  lockerReturnChargeCode?: string;
  sortingHubId?: union;
  deliveryLogisticLocationId?: union;
  pickupLogisticLocationId?: union;
  oohClientChargeCode?: string;
}
