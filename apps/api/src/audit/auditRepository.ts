import type { PoolClient } from "pg";
import type { OrderStatus } from '../orderLifecycle.js'
import type { PaymentStatus } from '../payments/payment.js'
import type {
  AuditActor,
  ProductAuditAction,
  ProductAuditEventInput,
} from './auditEvent.js'

const AUDIT_SCHEMA_VERSION = 1

type ProductAuditRecord = {
  action: ProductAuditAction
  actor: AuditActor
  orderId: number
  previousOrderStatus: OrderStatus | null
  newOrderStatus: OrderStatus
  previousPaymentStatus: PaymentStatus | null
  newPaymentStatus: PaymentStatus
  context: Record<string, unknown>
}

function assertNever(value: never): never {
  throw new Error(
    `Unsupported product audit event: ${JSON.stringify(value)}`,
  )
}

function buildProductAuditRecord(
  event: ProductAuditEventInput,
): ProductAuditRecord {
  switch (event.action) {
    case 'ORDER_CREATED':
      return {
        action: event.action,
        actor: event.actor,
        orderId: event.orderId,
        previousOrderStatus: null,
        newOrderStatus: 'NEW',
        previousPaymentStatus: null,
        newPaymentStatus: 'AWAITING_PAYMENT',
        context: {
          orderSource: event.orderSource,
          itemCount: event.itemCount,
        },
      }

    case 'PAYMENT_REPORTED':
      return {
        action: event.action,
        actor: event.actor,
        orderId: event.orderId,
        previousOrderStatus: event.orderStatus,
        newOrderStatus: event.orderStatus,
        previousPaymentStatus: 'AWAITING_PAYMENT',
        newPaymentStatus: 'REPORTED',
        context: {
          paymentMethod: event.paymentMethod,
        },
      }

    case 'PAYMENT_CONFIRMED':
      return {
        action: event.action,
        actor: event.actor,
        orderId: event.orderId,
        previousOrderStatus: event.orderStatus,
        newOrderStatus: event.orderStatus,
        previousPaymentStatus: 'REPORTED',
        newPaymentStatus: 'CONFIRMED',
        context: {
          paymentMethod: event.paymentMethod,
        },
      }

    case 'ORDER_PROCESSING_STARTED':
      return {
        action: event.action,
        actor: event.actor,
        orderId: event.orderId,
        previousOrderStatus: 'NEW',
        newOrderStatus: 'IN_PROGRESS',
        previousPaymentStatus: event.paymentStatus,
        newPaymentStatus: event.paymentStatus,
        context: {},
      }

    case 'ORDER_COMPLETED':
      return {
        action: event.action,
        actor: event.actor,
        orderId: event.orderId,
        previousOrderStatus: 'IN_PROGRESS',
        newOrderStatus: 'COMPLETED',
        previousPaymentStatus: event.paymentStatus,
        newPaymentStatus: event.paymentStatus,
        context: {},
      }

    case 'ORDER_CANCELLED':
      return {
        action: event.action,
        actor: event.actor,
        orderId: event.orderId,
        previousOrderStatus: event.previousOrderStatus,
        newOrderStatus: 'CANCELLED',
        previousPaymentStatus: event.paymentStatus,
        newPaymentStatus: event.paymentStatus,
        context: {},
      }

    default:
      return assertNever(event)
  }
}

export async function recordProductAuditEvent(
  client: PoolClient,
  event: ProductAuditEventInput,
): Promise<void> {
  const record = buildProductAuditRecord(event)

  const result = await client.query(
    `
      INSERT INTO audit_events (
        schema_version,
        category,
        action,
        outcome,
        severity,
        actor_type,
        actor_user_id,
        actor_username,
        actor_role,
        target_resource_type,
        target_resource_id,
        previous_order_status,
        new_order_status,
        previous_payment_status,
        new_payment_status,
        context
      )
      VALUES (
        $1,
        'PRODUCT',
        $2,
        'SUCCESS',
        'INFO',
        'USER',
        $3,
        $4,
        $5,
        'ORDER',
        $6,
        $7,
        $8,
        $9,
        $10,
        $11::jsonb
      )
    `,
    [
      AUDIT_SCHEMA_VERSION,
      record.action,
      record.actor.id,
      record.actor.username,
      record.actor.role,
      String(record.orderId),
      record.previousOrderStatus,
      record.newOrderStatus,
      record.previousPaymentStatus,
      record.newPaymentStatus,
      JSON.stringify(record.context),
    ],
  )

  if (result.rowCount !== 1) {
    throw new Error(
      'Product audit insert did not create exactly one event',
    )
  }
}