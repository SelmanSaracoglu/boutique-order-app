import type { PoolClient } from 'pg'
import { pool } from '../db.js'
import type { OrderStatus } from '../orderLifecycle.js'
import type {
  PaymentMethod,
  PaymentStatus,
} from './payment.js'
import {
  findPaymentOrderForUpdate,
  persistReportedPayment,
  type ReportedPayment,
} from './paymentRepository.js'

const TERMINAL_ORDER_STATUSES: readonly OrderStatus[] = [
  'COMPLETED',
  'CANCELLED',
]

export type ReportPaymentResult =
  | {
      outcome: 'reported'
      payment: ReportedPayment
    }
  | {
      outcome: 'not_found'
    }
  | {
      outcome: 'not_allowed'
      orderStatus: OrderStatus
      paymentStatus: PaymentStatus
    }

export async function reportPayment(
  orderId: number,
  paymentMethod: PaymentMethod,
): Promise<ReportPaymentResult> {
  let client: PoolClient | undefined
  let transactionStarted = false

  try {
    client = await pool.connect()

    await client.query('BEGIN')
    transactionStarted = true

    const order = await findPaymentOrderForUpdate(
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

    const orderIsTerminal =
      TERMINAL_ORDER_STATUSES.includes(
        order.orderStatus,
      )

    if (
      orderIsTerminal ||
      order.paymentStatus !== 'AWAITING_PAYMENT'
    ) {
      await client.query('ROLLBACK')
      transactionStarted = false

      return {
        outcome: 'not_allowed',
        orderStatus: order.orderStatus,
        paymentStatus: order.paymentStatus,
      }
    }

    const payment = await persistReportedPayment(
      client,
      orderId,
      paymentMethod,
    )

    await client.query('COMMIT')
    transactionStarted = false

    return {
      outcome: 'reported',
      payment,
    }
  } catch (error) {
    if (client && transactionStarted) {
      try {
        await client.query('ROLLBACK')
      } catch (rollbackError) {
        console.error(
          'Failed to rollback payment report transaction',
          rollbackError,
        )
      }
    }

    throw error
  } finally {
    client?.release()
  }
}