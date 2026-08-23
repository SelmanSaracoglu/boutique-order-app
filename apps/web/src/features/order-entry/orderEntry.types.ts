export type OrderSource = 'instagram' | 'whatsapp';

export type OrderItemFormValues = {
  supplierAlias: string;
  description: string;
  size: string;
  color: string;
  quantity: string;
  unitPrice: string;
};

export type OrderEntryFormValues = {
  orderSource: OrderSource | '';
  customerIdentifier: string;
  customerName: string;
  operationalNote: string;
  items: OrderItemFormValues[];
};

export type OrderItemData = {
  supplierAlias: string;
  description: string;
  size?: string;
  color?: string;
  quantity: number;
  unitPrice: number;
};

export type OrderEntryData = {
  orderSource: OrderSource;
  customerIdentifier: string;
  customerName?: string;
  operationalNote?: string;
  items: OrderItemData[];
};

export type OrderItemErrors = {
  supplierAlias?: string;
  description?: string;
  quantity?: string;
  unitPrice?: string;
};

export type OrderEntryErrors = {
  orderSource?: string;
  customerIdentifier?: string;
  items?: OrderItemErrors[];
  itemsMessage?: string;
};