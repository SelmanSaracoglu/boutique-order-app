export type OrderStatus =
  | 'NEW'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

export type OrderSummary = {
  id: number;
  customerIdentifier: string;
  customerName?: string;
  createdAt: string;
  status: OrderStatus;
  total: number;
};

export type CreateOrderItemRequest = {
  supplierAlias: string;
  description: string;
  size?: string;
  color?: string;
  quantity: number;
  unitPrice: number;
};

export type CreateOrderRequest = {
  orderSource: 'instagram' | 'whatsapp';
  customerIdentifier: string;
  customerName?: string;
  operationalNote?: string;
  items: CreateOrderItemRequest[];
};

export type PersistedOrderItem = CreateOrderItemRequest & {
  id: number;
  position: number;
};

export type PersistedOrder = {
  id: number;
  orderSource: 'instagram' | 'whatsapp';
  customerIdentifier: string;
  customerName?: string;
  operationalNote?: string;
  status: OrderStatus;
  createdAt: string;
  items: PersistedOrderItem[];
};

export async function listOrders(): Promise<OrderSummary[]> {
  const response = await fetch('/api/orders');

  if (!response.ok) {
    throw new Error('Unable to retrieve orders.');
  }

  return response.json() as Promise<OrderSummary[]>;
}

export async function createOrder(
  order: CreateOrderRequest,
): Promise<PersistedOrder> {
  const response = await fetch('/api/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(order),
  });

  if (!response.ok) {
    throw new Error('Unable to create order.');
  }

  return response.json() as Promise<PersistedOrder>;
}

