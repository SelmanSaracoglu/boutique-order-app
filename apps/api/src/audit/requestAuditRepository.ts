import { isIP } from 'node:net'
import { pool } from '../db.js'
import {
  sanitizeLogText,
  type StructuredLogRecord,
  writeStructuredLog,
} from '../logging/structuredLogger.js'
import type {
  RequestAuditActor,
  SecurityAuditAction,
  SecurityAuditEventInput,
  SecurityAuditReasonCode,
} from './requestAuditEvent.js'

const AUDIT_SCHEMA_VERSION = 2
const FALLBACK_LOG_SCHEMA_VERSION = 1
const SERVICE_NAME = 'boutique-order-api'

const MAX_ENVIRONMENT_LENGTH = 32
const MAX_USERNAME_LENGTH = 64
const MAX_TARGET_ID_LENGTH = 256
const MAX_METHOD_LENGTH = 16
const MAX_ROUTE_LENGTH = 256
const MAX_USER_AGENT_LENGTH = 256
const MAX_ATTEMPTED_USERNAME_LENGTH = 64

type SecurityAuditOutcome =
  | 'SUCCESS'
  | 'FAILURE'
  | 'REJECTED'

type SecurityAuditSeverity = 'INFO' | 'WARN'

type SecurityAuditClassification = {
  outcome: SecurityAuditOutcome
  severity: SecurityAuditSeverity
}

const SECURITY_AUDIT_CLASSIFICATION = {
  AUTH_LOGIN_SUCCEEDED: {
    outcome: 'SUCCESS',
    severity: 'INFO',
  },
  AUTH_LOGIN_FAILED: {
    outcome: 'FAILURE',
    severity: 'WARN',
  },
  AUTH_LOGIN_RATE_LIMITED: {
    outcome: 'REJECTED',
    severity: 'WARN',
  },
  AUTH_LOGOUT_SUCCEEDED: {
    outcome: 'SUCCESS',
    severity: 'INFO',
  },
  AUTHENTICATION_REQUIRED: {
    outcome: 'REJECTED',
    severity: 'WARN',
  },
  SESSION_REJECTED: {
    outcome: 'REJECTED',
    severity: 'WARN',
  },
  AUTHORIZATION_DENIED: {
    outcome: 'REJECTED',
    severity: 'WARN',
  },
  CSRF_VALIDATION_FAILED: {
    outcome: 'REJECTED',
    severity: 'WARN',
  },
  REQUEST_VALIDATION_FAILED: {
    outcome: 'REJECTED',
    severity: 'INFO',
  },
  ORDER_DETAIL_VIEWED: {
    outcome: 'SUCCESS',
    severity: 'INFO',
  },
  AUDIT_LOG_VIEWED: {
    outcome: 'SUCCESS',
    severity: 'INFO',
  },
} as const satisfies Record<
  SecurityAuditAction,
  SecurityAuditClassification
>

type SecurityAuditRecord = {
  action: SecurityAuditAction
  outcome: SecurityAuditOutcome
  severity: SecurityAuditSeverity
  actorType: RequestAuditActor['type']
  actorUserId: number | null
  actorUsername: string | null
  actorRole: string | null
  targetResourceType: string
  targetResourceId: string
  requestId: string
  operation: string
  httpMethod: string
  httpRoute: string
  httpStatus: number
  reasonCode: SecurityAuditReasonCode | null
  sourceIp: string | null
  userAgent: string | null
  context: Record<string, unknown>
}

export type AuditFallbackWriter = (
  record: StructuredLogRecord,
) => void

function assertNever(value: never): never {
  void value

  throw new Error(
    'Unsupported security audit event',
  )
}

function readEnvironment(): string {
  return (
    sanitizeLogText(
      process.env.NODE_ENV ?? 'development',
      MAX_ENVIRONMENT_LENGTH,
    ) || 'development'
  )
}

function buildActorColumns(
  actor: RequestAuditActor,
): Pick<
  SecurityAuditRecord,
  | 'actorType'
  | 'actorUserId'
  | 'actorUsername'
  | 'actorRole'
> {
  if (actor.type !== 'USER') {
    return {
      actorType: actor.type,
      actorUserId: null,
      actorUsername: null,
      actorRole: null,
    }
  }

  return {
    actorType: 'USER',
    actorUserId: actor.user.id,
    actorUsername:
      sanitizeLogText(
        actor.user.username,
        MAX_USERNAME_LENGTH,
      ) || null,
    actorRole: actor.user.role,
  }
}

function readReasonCode(
  event: SecurityAuditEventInput,
): SecurityAuditReasonCode | null {
  switch (event.action) {
    case 'AUTH_LOGIN_SUCCEEDED':
    case 'AUTH_LOGOUT_SUCCEEDED':
    case 'ORDER_DETAIL_VIEWED':
    case 'AUDIT_LOG_VIEWED':
      return null

    case 'AUTH_LOGIN_FAILED':
    case 'AUTH_LOGIN_RATE_LIMITED':
    case 'AUTHENTICATION_REQUIRED':
    case 'SESSION_REJECTED':
    case 'AUTHORIZATION_DENIED':
    case 'CSRF_VALIDATION_FAILED':
    case 'REQUEST_VALIDATION_FAILED':
      return event.reasonCode

    default:
      return assertNever(event)
  }
}

function buildContext(
  event: SecurityAuditEventInput,
): Record<string, unknown> {
  switch (event.action) {
    case 'AUTH_LOGIN_FAILED':
    case 'AUTH_LOGIN_RATE_LIMITED':
      return {
        attemptedUsername:
          sanitizeLogText(
            event.attemptedUsername,
            MAX_ATTEMPTED_USERNAME_LENGTH,
          ) || 'unknown',
      }

    case 'AUTHORIZATION_DENIED':
      return {
        permission: event.permission,
      }

    case 'AUTH_LOGIN_SUCCEEDED':
    case 'AUTH_LOGOUT_SUCCEEDED':
    case 'AUTHENTICATION_REQUIRED':
    case 'SESSION_REJECTED':
    case 'CSRF_VALIDATION_FAILED':
    case 'REQUEST_VALIDATION_FAILED':
    case 'ORDER_DETAIL_VIEWED':
    case 'AUDIT_LOG_VIEWED':
      return {}

    default:
      return assertNever(event)
  }
}

function buildSecurityAuditRecord(
  event: SecurityAuditEventInput,
): SecurityAuditRecord {
  const classification =
    SECURITY_AUDIT_CLASSIFICATION[event.action]

  return {
    action: event.action,
    outcome: classification.outcome,
    severity: classification.severity,
    ...buildActorColumns(event.actor),
    targetResourceType:
      event.target.resourceType,
    targetResourceId:
      sanitizeLogText(
        event.target.resourceId,
        MAX_TARGET_ID_LENGTH,
      ),
    requestId: event.request.requestId,
    operation: event.request.operation,
    httpMethod: sanitizeLogText(
      event.request.method,
      MAX_METHOD_LENGTH,
    ),
    httpRoute: sanitizeLogText(
      event.request.route,
      MAX_ROUTE_LENGTH,
    ),
    httpStatus: event.request.status,
    reasonCode: readReasonCode(event),
    sourceIp:
      isIP(event.request.sourceIp) > 0
        ? event.request.sourceIp
        : null,
    userAgent:
      event.request.userAgent === null
        ? null
        : (
            sanitizeLogText(
              event.request.userAgent,
              MAX_USER_AGENT_LENGTH,
            ) || null
          ),
    context: buildContext(event),
  }
}

async function insertSecurityAuditRecord(
  record: SecurityAuditRecord,
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
        context
      )
      VALUES (
        $1,
        'SECURITY',
        $2,
        $3,
        $4,
        $5,
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
        $19::jsonb
      )
    `,
    [
      AUDIT_SCHEMA_VERSION,
      record.action,
      record.outcome,
      record.severity,
      record.actorType,
      record.actorUserId,
      record.actorUsername,
      record.actorRole,
      record.targetResourceType,
      record.targetResourceId,
      record.requestId,
      record.operation,
      record.httpMethod,
      record.httpRoute,
      record.httpStatus,
      record.reasonCode,
      record.sourceIp,
      record.userAgent,
      JSON.stringify(record.context),
    ],
  )

  if (result.rowCount !== 1) {
    throw new Error(
      'Security audit insert did not create exactly one event',
    )
  }
}

function buildFallbackRecord(
  record: SecurityAuditRecord,
): StructuredLogRecord {
  return {
    timestamp: new Date().toISOString(),
    requestId: record.requestId,
    eventType: 'AUDIT_PERSISTENCE_FAILED',
    failureCode: 'AUDIT_PERSISTENCE_FAILED',
    service: SERVICE_NAME,
    environment: readEnvironment(),
    schemaVersion: FALLBACK_LOG_SCHEMA_VERSION,
    auditEvent: {
      schemaVersion: AUDIT_SCHEMA_VERSION,
      category: 'SECURITY',
      action: record.action,
      outcome: record.outcome,
      severity: record.severity,
      operation: record.operation,
      method: record.httpMethod,
      route: record.httpRoute,
      status: record.httpStatus,
      actor:
        record.actorType === 'USER'
          ? {
              type: 'USER',
              userId: record.actorUserId,
              username: record.actorUsername,
              role: record.actorRole,
            }
          : {
              type: record.actorType,
            },
      target: {
        resourceType: record.targetResourceType,
        resourceId: record.targetResourceId,
      },
      reasonCode: record.reasonCode,
      sourceIp: record.sourceIp ?? 'unknown',
      userAgent: record.userAgent,
      context: record.context,
    },
  }
}

const defaultFallbackWriter: AuditFallbackWriter = (
  record,
) => {
  writeStructuredLog('stderr', record)
}

export async function tryRecordSecurityAuditEvent(
  event: SecurityAuditEventInput,
  writeFallback: AuditFallbackWriter =
    defaultFallbackWriter,
): Promise<boolean> {
  const record = buildSecurityAuditRecord(event)

  try {
    await insertSecurityAuditRecord(record)
    return true
  } catch {
    try {
      writeFallback(buildFallbackRecord(record))
    } catch {
      return false
    }

    return false
  }
}