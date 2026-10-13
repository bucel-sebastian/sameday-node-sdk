/** Request body for updating a parcel status. */
export interface ParcelUpdateStatusRequestType {
  damageCheck?: 2 | 3;
  pinCode?: string;
  deliveryCheck?: 0 | 1;
  statusId: string;
  reasonId?: string;
}
