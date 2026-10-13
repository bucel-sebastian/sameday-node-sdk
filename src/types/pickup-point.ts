/** Contact person attached to a pickup point. */
export interface ContactPersonType {
  name: string;
  position?: string;
  phoneNumber: string;
  email?: string;
  defaultContactPerson?: 0 | 1;
}

export interface PickupPointType {
  /** Country id. */
  country?: string;
  /** County id (see /api/geolocation/county). */
  county: string;
  /** City id (see /api/geolocation/city). */
  city: string;
  /** Pickup point address. */
  address: string;
  /** Pickup point postal code. */
  postalCode?: string;
  /** Alias for pickup point. */
  alias: string;
  /** Last time of the day for accepting 24h deliveries, hour:minutes format, e.g. 12:00. */
  cutOff?: string;
  /** The delivery interval. */
  deliveryInterval?: string;
  /** If pickup point is without pickup allocation (0 -> no, 1 -> yes). */
  noPickupAllocation?: 0 | 1;
  /** If pickup point is default (0 -> no, 1 -> yes). */
  defaultPickupPoint?: 0 | 1;
  /** Contact person for one pickup point. */
  pickupPointContactPerson: ContactPersonType[];
  /** Personal delivery (0 -> no, 1 -> yes). */
  personalDelivery?: 0 | 1;
}

export interface NonMandatoryPickupPointType {
  /** Country id. */
  country?: string;
  /** County id (see /api/geolocation/county). */
  county?: string;
  /** City id (see /api/geolocation/city). */
  city?: string;
  /** Pickup point address. */
  address?: string;
  /** Pickup point postal code. */
  postalCode?: string;
  /** Alias for pickup point. */
  alias?: string;
  /** The delivery interval. */
  deliveryInterval?: string;
  /** If pickup point is without pickup allocation (0 -> no, 1 -> yes). */
  noPickupAllocation?: 0 | 1;
  /** If pickup point is default (0 -> no, 1 -> yes). */
  defaultPickupPoint?: 0 | 1;
  /** Personal delivery (0 -> no, 1 -> yes). */
  personalDelivery?: 0 | 1;
  /** Pickup point status (0 -> inactive, 1 -> active). */
  status?: 0 | 1;
}
