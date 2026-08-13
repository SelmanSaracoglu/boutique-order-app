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
  channel: OrderChannel | '';
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
  channel: OrderChannel;
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
  channel?: string;
  items?: OrderItemErrors[];
  itemsMessage?: string;
};