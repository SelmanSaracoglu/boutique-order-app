import type { PoolClient } from 'pg'
import type { OrderStatus } from '../orderLifecycle.js'
import type {
  PaymentMethod,
  PaymentStatus,
} from './payment.js'

export type PaymentOrder = {
  id: number
  orderStatus: OrderStatus
  paymentStatus: PaymentStatus
  paymentMethod: PaymentMethod | null
}

export type ReportedPayment = {
  id: number
  paymentStatus: PaymentStatus
  paymentMethod: PaymentMethod
}

export type ConfirmedPayment = {
  id: number
  paymentStatus: 'CONFIRMED'
  paymentMethod: PaymentMethod
}

type PaymentOrderRow = {
  id: number
  status: OrderStatus
  payment_status: PaymentStatus
  payment_method: PaymentMethod | null
}

type ReportedPaymentRow = {
  id: number
  payment_status: PaymentStatus
  payment_method: PaymentMethod
}

type ConfirmedPaymentRow = {
  id: number
  payment_status: 'CONFIRMED'
  payment_method: PaymentMethod | null
}

export async function findPaymentOrderForUpdate(
  client: PoolClient,
  orderId: number,
): Promise<PaymentOrder | null> {
  const result = await client.query(
    `
      SELECT
        id,
        status,
        payment_status,
        payment_method
      FROM orders
      WHERE id = $1
      FOR UPDATE
    `,
    [orderId],
  )

  const row = result.rows[0] as
    | PaymentOrderRow
    | undefined

  if (!row) {
    return null
  }

  return {
    id: row.id,
    orderStatus: row.status,
    paymentStatus: row.payment_status,
    paymentMethod: row.payment_method,
  }
}

export async function persistReportedPayment(
  client: PoolClient,
  orderId: number,
  paymentMethod: PaymentMethod,
): Promise<ReportedPayment> {
  const result = await client.query(
    `
      UPDATE orders
      SET
        payment_status = 'REPORTED',
        payment_method = $1
      WHERE id = $2
      RETURNING
        id,
        payment_status,
        payment_method
    `,
    [paymentMethod, orderId],
  )

  const row = result.rows[0] as
    | ReportedPaymentRow
    | undefined

  if (!row) {
    throw new Error(
      'Payment report update returned no row',
    )
  }

  return {
    id: row.id,
    paymentStatus: row.payment_status,
    paymentMethod: row.payment_method,
  }
}

export async function persistConfirmedPayment(
  client: PoolClient,
  orderId: number,
): Promise<ConfirmedPayment> {
  const result = await client.query(
    `
      UPDATE orders
      SET payment_status = 'CONFIRMED'
      WHERE id = $1
      RETURNING
        id,
        payment_status,
        payment_method
    `,
    [orderId],
  )

  const row = result.rows[0] as
    | ConfirmedPaymentRow
    | undefined

  if (!row || !row.payment_method) {
    throw new Error(
      'Payment confirmation update returned an invalid row',
    )
  }

  return {
    id: row.id,
    paymentStatus: row.payment_status,
    paymentMethod: row.payment_method,
  }
}