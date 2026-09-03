import { CSRF_HEADER_NAME } from '../auth/authApi';

export type OrderStatus =
  | 'NEW'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

export type PaymentStatus =
  | 'AWAITING_PAYMENT'
  | 'REPORTED'
  | 'CONFIRMED';

export type PaymentMethod =
  | 'BANK_TRANSFER'
  | 'PAYPAL';

export type OrderSummary = {
  id: number;
  customerIdentifier: string;
  customerName?: string;
  createdAt: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod | null;
  total: number;
};

export type UpdateOrderStatusRequest = {
  status: OrderStatus;
};

export type UpdateOrderStatusResponse = {
  id: number;
  status: OrderStatus;
};

export type ReportPaymentRequest = {
  paymentMethod: PaymentMethod;
};

export type ReportPaymentResponse = {
  id: number;
  paymentStatus: 'REPORTED';
  paymentMethod: PaymentMethod;
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
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod | null;
  createdAt: string;
  items: PersistedOrderItem[];
};

export type OrderDetailItem = {
  id: number;
  position: number;
  supplierAlias: string;
  description: string;
  size?: string;
  color?: string;
  quantity: number;
  unitPrice: number;
};

export type OrderDetail = {
  id: number;
  orderSource: 'instagram' | 'whatsapp';
  customerIdentifier: string;
  customerName?: string;
  operationalNote?: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod | null;
  createdAt: string;
  items: OrderDetailItem[];
  total: number;
};

export class OrderNotFoundError extends Error {
  constructor() {
    super('Order was not found.');
    this.name = 'OrderNotFoundError'
  }
}

export class OrderStatusConflictError extends Error {
  constructor() {
    super('Order status transition is no longer available.');
    this.name = 'OrderStatusConflictError';
  }
}

export class PaymentReportConflictError extends Error {
  constructor() {
    super('Payment report is no longer available.');
    this.name = 'PaymentReportConflictError';
  }
}

export async function listOrders(): Promise<OrderSummary[]> {
  const response = await fetch('/api/orders');

  if (!response.ok) {
    throw new Error('Unable to retrieve orders.');
  }

  return response.json() as Promise<OrderSummary[]>;
}

export async function createOrder(
  order: CreateOrderRequest,
  csrfToken: string,
): Promise<PersistedOrder> {
  const response = await fetch('/api/orders', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      [CSRF_HEADER_NAME]: csrfToken,
    },
    body: JSON.stringify(order),
  });

  if (!response.ok) {
    throw new Error('Unable to create order.');
  }

  return response.json() as Promise<PersistedOrder>;
}

export async function getOrder(
  orderId: number,
): Promise<OrderDetail> {
  const response = await fetch(`/api/orders/${orderId}`);

  if (response.status === 404) {
    throw new OrderNotFoundError();
  }

  if (!response.ok) {
    throw new Error('Unable to retrieve order.');
  }

  return response.json() as Promise<OrderDetail>;
}

export async function updateOrderStatus(
  orderId: number,
  status: OrderStatus,
  csrfToken: string,
): Promise<UpdateOrderStatusResponse> {
  const requestBody: UpdateOrderStatusRequest = {
    status,
  };

  const response = await fetch(
    `/api/orders/${orderId}/status`,
    {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        [CSRF_HEADER_NAME]: csrfToken,
      },
      body: JSON.stringify(requestBody),
    },
  );

  if (response.status === 409) {
    throw new OrderStatusConflictError();
  }

  if (!response.ok) {
    throw new Error('Unable to update order status.');
  }

  return response.json() as Promise<UpdateOrderStatusResponse>;
}

export async function reportPayment(
  orderId: number,
  paymentMethod: PaymentMethod,
  csrfToken: string,
): Promise<ReportPaymentResponse> {
  const requestBody: ReportPaymentRequest = {
    paymentMethod,
  };

  const response = await fetch(
    `/api/orders/${orderId}/payment-report`,
    {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        [CSRF_HEADER_NAME]: csrfToken,
      },
      body: JSON.stringify(requestBody),
    },
  );

  if (response.status === 409) {
    throw new PaymentReportConflictError();
  }

  if (!response.ok) {
    throw new Error('Unable to report payment.');
  }

  return response.json() as Promise<ReportPaymentResponse>;
}