export type ContactChannel = 'instagram' | 'whatsapp';
export type OrderChannel = 'instagram' | 'whatsapp';

export type OrderItemFormValues = {
  supplierAlias: string;
  description: string;
  size: string;
  color: string;
  quantity: string;
};

export type OrderEntryFormValues = {
  customerReference: string;
  contactChannel: ContactChannel | '';
  contactValue: string;
  orderChannel: OrderChannel | '';
  orderDate: string;
  operationalNote: string;
  items: OrderItemFormValues[];
};

export type OrderItemData = {
  supplierAlias: string;
  description: string;
  size: string;
  color: string;
  quantity: number;
};

export type OrderEntryData = {
  customerReference: string;
  contactChannel: ContactChannel;
  contactValue: string;
  orderChannel: OrderChannel;
  orderDate: string;
  operationalNote?: string;
  items: OrderItemData[];
};

export type OrderItemErrors = {
  supplierAlias?: string;
  description?: string;
  size?: string;
  color?: string;
  quantity?: string;
};

export type OrderEntryErrors = {
  customerReference?: string;
  contactChannel?: string;
  contactValue?: string;
  orderChannel?: string;
  orderDate?: string;
  items?: OrderItemErrors[];
  itemsMessage?: string;
};