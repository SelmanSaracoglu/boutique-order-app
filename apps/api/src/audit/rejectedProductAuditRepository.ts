import { isIP } from 'node:net'
import { pool } from '../db.js'
import {
  sanitizeLogText,
  type StructuredLogRecord,
  writeStructuredLog,
} from '../logging/structuredLogger.js'
import type {
  OrderStatus,
} from '../orderLifecycle.js'
import type {
  PaymentStatus,
} from '../payments/payment.js'
import type {
  AuditActor,
  RejectedProductAuditEventInput,
  RejectedProductAuditReasonCode,
} from './auditEvent.js'

const AUDIT_SCHEMA_VERSION = 2
const FALLBACK_LOG_SCHEMA_VERSION = 1
const SERVICE_NAME =
  'boutique-order-api'

const MAX_ENVIRONMENT_LENGTH = 32
const MAX_USERNAME_LENGTH = 64
const MAX_METHOD_LENGTH = 16
const MAX_ROUTE_LENGTH = 256
const MAX_USER_AGENT_LENGTH = 256

type RejectedProductAuditRecord = {
  action:
    RejectedProductAuditEventInput['action']
  actorUserId: number
  actorUsername: string
  actorRole: AuditActor['role']
  orderId: number
  requestId: string
  operation: string
  httpMethod: string
  httpRoute: string
  httpStatus: number
  reasonCode:
    RejectedProductAuditReasonCode
  sourceIp: string | null
  userAgent: string | null
  currentOrderStatus: OrderStatus
  requestedOrderStatus: OrderStatus
  currentPaymentStatus:
    PaymentStatus
  requestedPaymentStatus:
    PaymentStatus
}

type RequestedProductState = Pick<
  RejectedProductAuditRecord,
  | 'requestedOrderStatus'
  | 'requestedPaymentStatus'
>

export type RejectedProductAuditFallbackWriter =
  (
    record: StructuredLogRecord,
  ) => void

function assertNever(
  value: never,
): never {
  void value

  throw new Error(
    'Unsupported rejected product audit event',
  )
}

function readEnvironment(): string {
  return (
    sanitizeLogText(
      process.env.NODE_ENV ??
        'development',
      MAX_ENVIRONMENT_LENGTH,
    ) || 'development'
  )
}

function sanitizeRequiredText(
  value: string,
  maxLength: number,
  fallback: string,
): string {
  return (
    sanitizeLogText(
      value,
      maxLength,
    ) || fallback
  )
}

function buildRequestedProductState(
  event:
    RejectedProductAuditEventInput,
): RequestedProductState {
  switch (event.action) {
    case 'ORDER_PROCESSING_STARTED':
      return {
        requestedOrderStatus:
          'IN_PROGRESS',
        requestedPaymentStatus:
          event.currentPaymentStatus,
      }

    case 'ORDER_COMPLETED':
      return {
        requestedOrderStatus:
          'COMPLETED',
        requestedPaymentStatus:
          event.currentPaymentStatus,
      }

    case 'ORDER_CANCELLED':
      return {
        requestedOrderStatus:
          'CANCELLED',
        requestedPaymentStatus:
          event.currentPaymentStatus,
      }

    case 'PAYMENT_REPORTED':
      return {
        requestedOrderStatus:
          event.currentOrderStatus,
        requestedPaymentStatus:
          'REPORTED',
      }

    case 'PAYMENT_CONFIRMED':
      return {
        requestedOrderStatus:
          event.currentOrderStatus,
        requestedPaymentStatus:
          'CONFIRMED',
      }

    default:
      return assertNever(event)
  }
}

function buildRejectedProductAuditRecord(
  event:
    RejectedProductAuditEventInput,
): RejectedProductAuditRecord {
  return {
    action: event.action,
    actorUserId: event.actor.id,
    actorUsername:
      sanitizeRequiredText(
        event.actor.username,
        MAX_USERNAME_LENGTH,
        'unknown',
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
        'UNKNOWN',
      ),
    httpRoute:
      sanitizeRequiredText(
        event.request.route,
        MAX_ROUTE_LENGTH,
        'UNMATCHED',
      ),
    httpStatus:
      event.request.status,
    reasonCode: event.reasonCode,
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
    currentOrderStatus:
      event.currentOrderStatus,
    currentPaymentStatus:
      event.currentPaymentStatus,
    ...buildRequestedProductState(
      event,
    ),
  }
}

async function insertRejectedProductAuditRecord(
  record:
    RejectedProductAuditRecord,
): Promise<void> {
  const result = await pool.query(
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
        reason_code,
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
        'REJECTED',
        'WARN',
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
        $18,
        '{}'::jsonb
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
      record.reasonCode,
      record.sourceIp,
      record.userAgent,
      record.currentOrderStatus,
      record.requestedOrderStatus,
      record.currentPaymentStatus,
      record.requestedPaymentStatus,
    ],
  )

  if (result.rowCount !== 1) {
    throw new Error(
      'Rejected product audit insert did not create exactly one event',
    )
  }
}

function buildFallbackRecord(
  record:
    RejectedProductAuditRecord,
): StructuredLogRecord {
  return {
    timestamp: new Date().toISOString(),
    requestId: record.requestId,
    eventType:
      'AUDIT_PERSISTENCE_FAILED',
    failureCode:
      'AUDIT_PERSISTENCE_FAILED',
    service: SERVICE_NAME,
    environment: readEnvironment(),
    schemaVersion:
      FALLBACK_LOG_SCHEMA_VERSION,
    auditEvent: {
      schemaVersion:
        AUDIT_SCHEMA_VERSION,
      category: 'PRODUCT',
      action: record.action,
      outcome: 'REJECTED',
      severity: 'WARN',
      operation: record.operation,
      method: record.httpMethod,
      route: record.httpRoute,
      status: record.httpStatus,
      actor: {
        type: 'USER',
        userId: record.actorUserId,
        username:
          record.actorUsername,
        role: record.actorRole,
      },
      target: {
        resourceType: 'ORDER',
        resourceId:
          String(record.orderId),
      },
      reasonCode:
        record.reasonCode,
      sourceIp:
        record.sourceIp ??
        'unknown',
      userAgent: record.userAgent,
      currentOrderStatus:
        record.currentOrderStatus,
      requestedOrderStatus:
        record.requestedOrderStatus,
      currentPaymentStatus:
        record.currentPaymentStatus,
      requestedPaymentStatus:
        record.requestedPaymentStatus,
    },
  }
}

const defaultFallbackWriter:
  RejectedProductAuditFallbackWriter =
  (record) => {
    writeStructuredLog(
      'stderr',
      record,
    )
  }

export async function tryRecordRejectedProductAuditEvent(
  event:
    RejectedProductAuditEventInput,
  writeFallback:
    RejectedProductAuditFallbackWriter =
      defaultFallbackWriter,
): Promise<boolean> {
  const record =
    buildRejectedProductAuditRecord(
      event,
    )

  try {
    await insertRejectedProductAuditRecord(
      record,
    )

    return true
  } catch {
    try {
      writeFallback(
        buildFallbackRecord(record),
      )
    } catch {
      return false
    }

    return false
  }
}