import type {
  PoolClient,
} from 'pg'
import type {
  AuditActor,
} from '../audit/auditEvent.js'
import {
  recordProductAuditEvent,
} from '../audit/auditRepository.js'
import {
  tryRecordRejectedProductAuditEvent,
} from '../audit/rejectedProductAuditRepository.js'
import type {
  RequestAuditMetadata,
} from '../audit/requestAuditEvent.js'
import { pool } from '../db.js'
import type {
  OrderStatus,
} from '../orderLifecycle.js'
import type {
  PaymentStatus,
} from './payment.js'
import {
  findPaymentOrderForUpdate,
  persistConfirmedPayment,
  type ConfirmedPayment,
  type PaymentOrder,
} from './paymentRepository.js'

const TERMINAL_ORDER_STATUSES:
  readonly OrderStatus[] = [
    'COMPLETED',
    'CANCELLED',
  ]

export type ConfirmPaymentResult =
  | {
    outcome: 'confirmed'
    payment: ConfirmedPayment
  }
  | {
    outcome: 'not_found'
  }
  | {
    outcome: 'not_allowed'
    orderStatus: OrderStatus
    paymentStatus: PaymentStatus
  }

export function canConfirmPayment(
  order: PaymentOrder,
): boolean {
  return (
    !TERMINAL_ORDER_STATUSES.includes(
      order.orderStatus,
    ) &&
    order.paymentStatus ===
    'REPORTED' &&
    order.paymentMethod !== null
  )
}

export async function confirmPayment(
  orderId: number,
  actor: AuditActor,
  requestMetadata:
    RequestAuditMetadata,
): Promise<ConfirmPaymentResult> {
  let client: PoolClient | undefined
  let transactionStarted = false

  try {
    client = await pool.connect()

    await client.query('BEGIN')
    transactionStarted = true

    const order =
      await findPaymentOrderForUpdate(
        client,
        orderId,
      )

    if (!order) {
      await client.query('ROLLBACK')
      transactionStarted = false

      return {
        outcome: 'not_found',
      }
    }

    if (!canConfirmPayment(order)) {
      await client.query('ROLLBACK')
      transactionStarted = false

      await tryRecordRejectedProductAuditEvent(
        {
          action:
            'PAYMENT_CONFIRMED',
          reasonCode:
            'INVALID_PAYMENT_TRANSITION',
          actor,
          orderId,
          currentOrderStatus:
            order.orderStatus,
          currentPaymentStatus:
            order.paymentStatus,
          request: {
            ...requestMetadata,
            status: 409,
          },
        },
      )

      return {
        outcome: 'not_allowed',
        orderStatus:
          order.orderStatus,
        paymentStatus:
          order.paymentStatus,
      }
    }

    const payment =
      await persistConfirmedPayment(
        client,
        orderId,
      )

    await recordProductAuditEvent(
      client,
      {
        action:
          'PAYMENT_CONFIRMED',
        actor,
        orderId,
        request: requestMetadata,
        orderStatus:
          order.orderStatus,
        paymentMethod:
          payment.paymentMethod,
      },
    )

    await client.query('COMMIT')
    transactionStarted = false

    return {
      outcome: 'confirmed',
      payment,
    }
  } catch (error) {
    if (
      client &&
      transactionStarted
    ) {
      try {
        await client.query(
          'ROLLBACK',
        )
      } catch {
        client.release(true)
        client = undefined
      }
    }

    throw error
  } finally {
    client?.release()
  }
}