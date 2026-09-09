import { isIP } from 'node:net'
import type {
  PoolClient,
} from 'pg'
import {
  sanitizeLogText,
} from '../logging/structuredLogger.js'
import type {
  OrderStatus,
} from '../orderLifecycle.js'
import type {
  PaymentStatus,
} from '../payments/payment.js'
import type {
  AuditActor,
  ProductAuditAction,
  ProductAuditEventInput,
} from './auditEvent.js'

const AUDIT_SCHEMA_VERSION = 2

const MAX_USERNAME_LENGTH = 64
const MAX_METHOD_LENGTH = 16
const MAX_ROUTE_LENGTH = 256
const MAX_USER_AGENT_LENGTH = 256

type ProductAuditStateRecord = {
  previousOrderStatus:
    OrderStatus | null
  newOrderStatus: OrderStatus
  previousPaymentStatus:
    PaymentStatus | null
  newPaymentStatus: PaymentStatus
  context: Record<string, unknown>
}

type ProductAuditRecord =
  ProductAuditStateRecord & {
    action: ProductAuditAction
    actorUserId: number
    actorUsername: string
    actorRole: AuditActor['role']
    orderId: number
    requestId: string
    operation: string
    httpMethod: string
    httpRoute: string
    httpStatus: number
    sourceIp: string | null
    userAgent: string | null
  }

function assertNever(
  value: never,
): never {
  void value

  throw new Error(
    'Unsupported product audit event',
  )
}

function sanitizeRequiredText(
  value: string,
  maxLength: number,
): string {
  const sanitizedValue =
    sanitizeLogText(
      value,
      maxLength,
    )

  if (!sanitizedValue) {
    throw new Error(
      'Required product audit text is invalid',
    )
  }

  return sanitizedValue
}

function buildProductAuditStateRecord(
  event: ProductAuditEventInput,
): ProductAuditStateRecord {
  switch (event.action) {
    case 'ORDER_CREATED':
      return {
        previousOrderStatus: null,
        newOrderStatus: 'NEW',
        previousPaymentStatus: null,
        newPaymentStatus:
          'AWAITING_PAYMENT',
        context: {
          orderSource:
            event.orderSource,
          itemCount:
            event.itemCount,
        },
      }

    case 'PAYMENT_REPORTED':
      return {
        previousOrderStatus:
          event.orderStatus,
        newOrderStatus:
          event.orderStatus,
        previousPaymentStatus:
          'AWAITING_PAYMENT',
        newPaymentStatus: 'REPORTED',
        context: {
          paymentMethod:
            event.paymentMethod,
        },
      }

    case 'PAYMENT_CONFIRMED':
      return {
        previousOrderStatus:
          event.orderStatus,
        newOrderStatus:
          event.orderStatus,
        previousPaymentStatus:
          'REPORTED',
        newPaymentStatus:
          'CONFIRMED',
        context: {
          paymentMethod:
            event.paymentMethod,
        },
      }

    case 'ORDER_PROCESSING_STARTED':
      return {
        previousOrderStatus: 'NEW',
        newOrderStatus:
          'IN_PROGRESS',
        previousPaymentStatus:
          event.paymentStatus,
        newPaymentStatus:
          event.paymentStatus,
        context: {},
      }

    case 'ORDER_COMPLETED':
      return {
        previousOrderStatus:
          'IN_PROGRESS',
        newOrderStatus: 'COMPLETED',
        previousPaymentStatus:
          event.paymentStatus,
        newPaymentStatus:
          event.paymentStatus,
        context: {},
      }

    case 'ORDER_CANCELLED':
      return {
        previousOrderStatus:
          event.previousOrderStatus,
        newOrderStatus: 'CANCELLED',
        previousPaymentStatus:
          event.paymentStatus,
        newPaymentStatus:
          event.paymentStatus,
        context: {},
      }

    default:
      return assertNever(event)
  }
}

function buildProductAuditRecord(
  event: ProductAuditEventInput,
): ProductAuditRecord {
  return {
    action: event.action,
    actorUserId: event.actor.id,
    actorUsername:
      sanitizeRequiredText(
        event.actor.username,
        MAX_USERNAME_LENGTH,
      ),
    actorRole: event.actor.role,
    orderId: event.orderId,
    requestId:
      event.request.requestId,
    operation:
      event.request.operation,
    httpMethod:
      sanitizeRequiredText(
        event.request.method,
        MAX_METHOD_LENGTH,
      ),
    httpRoute:
      sanitizeRequiredText(
        event.request.route,
        MAX_ROUTE_LENGTH,
      ),
    httpStatus:
      event.request.status,
    sourceIp:
      isIP(
        event.request.sourceIp,
      ) > 0
        ? event.request.sourceIp
        : null,
    userAgent:
      event.request.userAgent ===
      null
        ? null
        : (
            sanitizeLogText(
              event.request.userAgent,
              MAX_USER_AGENT_LENGTH,
            ) || null
          ),
    ...buildProductAuditStateRecord(
      event,
    ),
  }
}

export async function recordProductAuditEvent(
  client: PoolClient,
  event: ProductAuditEventInput,
): Promise<void> {
  const record =
    buildProductAuditRecord(event)

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
        request_id,
        operation,
        http_method,
        http_route,
        http_status,
        source_ip,
        user_agent,
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
        $11,
        $12,
        $13,
        $14,
        $15,
        $16,
        $17,
        $18::jsonb
      )
    `,
    [
      AUDIT_SCHEMA_VERSION,
      record.action,
      record.actorUserId,
      record.actorUsername,
      record.actorRole,
      String(record.orderId),
      record.requestId,
      record.operation,
      record.httpMethod,
      record.httpRoute,
      record.httpStatus,
      record.sourceIp,
      record.userAgent,
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

export async function ensureAuditLoggingStarted(
  client: PoolClient,
): Promise<void> {
  await client.query(`
    INSERT INTO audit_events (
      schema_version,
      category,
      action,
      outcome,
      severity,
      actor_type,
      target_resource_type,
      target_resource_id,
      context
    )
    VALUES (
      1,
      'SYSTEM',
      'AUDIT_LOGGING_STARTED',
      'SUCCESS',
      'INFO',
      'SYSTEM',
      'AUDIT_LOG',
      'product-audit',
      '{}'::jsonb
    )
    ON CONFLICT DO NOTHING
  `)
}