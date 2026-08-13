export type OrderChannel = 'instagram' | 'whatsapp';

export type OrderEntryFormValues = {
  customerReference: string;
  channel: OrderChannel | '';
  itemDescription: string;
  quantity: string;
};

export type OrderEntryData = {
  customerReference: string;
  channel: OrderChannel;
  itemDescription: string;
  quantity: number;
};

export type OrderEntryErrors = {
  customerReference?: string;
  channel?: string;
  itemDescription?: string;
  quantity?: string;
};