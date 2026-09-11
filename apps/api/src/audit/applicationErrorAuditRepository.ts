import { isIP } from 'node:net'
import { pool } from '../db.js'
import {
  sanitizeLogText,
  type StructuredLogRecord,
  writeStructuredLog,
} from '../logging/structuredLogger.js'
import {
  APPLICATION_ERROR_ACTION,
  type ApplicationErrorCode,
  type ApplicationErrorEventInput,
} from './applicationErrorEvent.js'
import type {
  RequestAuditActor,
} from './requestAuditEvent.js'

const AUDIT_SCHEMA_VERSION = 2
const FALLBACK_LOG_SCHEMA_VERSION = 1
const SERVICE_NAME =
  'boutique-order-api'

const MAX_ENVIRONMENT_LENGTH = 32
const MAX_USERNAME_LENGTH = 64
const MAX_TARGET_ID_LENGTH = 256
const MAX_METHOD_LENGTH = 16
const MAX_ROUTE_LENGTH = 256
const MAX_USER_AGENT_LENGTH = 256

type ApplicationErrorAuditRecord = {
  actorType: RequestAuditActor['type']
  actorUserId: number | null
  actorUsername: string | null
  actorRole: string | null
  targetResourceType:
    ApplicationErrorEventInput['target']['resourceType']
  targetResourceId: string
  requestId: string
  operation: string
  httpMethod: string
  httpRoute: string
  httpStatus: number
  errorCode: ApplicationErrorCode
  sourceIp: string | null
  userAgent: string | null
}

export type ApplicationErrorAuditFallbackWriter =
  (
    record: StructuredLogRecord,
  ) => void

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
  maximumLength: number,
  fallback: string,
): string {
  return (
    sanitizeLogText(
      value,
      maximumLength,
    ) || fallback
  )
}

function buildActorColumns(
  actor: RequestAuditActor,
): Pick<
  ApplicationErrorAuditRecord,
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
      sanitizeRequiredText(
        actor.user.username,
        MAX_USERNAME_LENGTH,
        'unknown',
      ),
    actorRole: actor.user.role,
  }
}

function buildApplicationErrorAuditRecord(
  event: ApplicationErrorEventInput,
): ApplicationErrorAuditRecord {
  return {
    ...buildActorColumns(event.actor),
    targetResourceType:
      event.target.resourceType,
    targetResourceId:
      sanitizeRequiredText(
        event.target.resourceId,
        MAX_TARGET_ID_LENGTH,
        'unknown',
      ),
    requestId: event.request.requestId,
    operation: event.request.operation,
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
    httpStatus: event.request.status,
    errorCode: event.errorCode,
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
  }
}

async function insertApplicationErrorAuditRecord(
  record: ApplicationErrorAuditRecord,
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
        error_code,
        source_ip,
        user_agent,
        context
      )
      VALUES (
        $1,
        'ERROR',
        $2,
        'FAILURE',
        'ERROR',
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
        '{}'::jsonb
      )
    `,
    [
      AUDIT_SCHEMA_VERSION,
      APPLICATION_ERROR_ACTION,
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
      record.errorCode,
      record.sourceIp,
      record.userAgent,
    ],
  )

  if (result.rowCount !== 1) {
    throw new Error(
      'Application error audit insert did not create exactly one event',
    )
  }
}

function buildFallbackRecord(
  record: ApplicationErrorAuditRecord,
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
      category: 'ERROR',
      action:
        APPLICATION_ERROR_ACTION,
      outcome: 'FAILURE',
      severity: 'ERROR',
      operation: record.operation,
      method: record.httpMethod,
      route: record.httpRoute,
      status: record.httpStatus,
      errorCode: record.errorCode,
      actor:
        record.actorType === 'USER'
          ? {
              type: 'USER',
              userId:
                record.actorUserId,
              username:
                record.actorUsername,
              role:
                record.actorRole,
            }
          : {
              type: record.actorType,
            },
      target: {
        resourceType:
          record.targetResourceType,
        resourceId:
          record.targetResourceId,
      },
      sourceIp:
        record.sourceIp ?? 'unknown',
      userAgent: record.userAgent,
    },
  }
}

const defaultFallbackWriter:
  ApplicationErrorAuditFallbackWriter =
  (record) => {
    writeStructuredLog(
      'stderr',
      record,
    )
  }

export async function tryRecordApplicationErrorEvent(
  event: ApplicationErrorEventInput,
  writeFallback:
    ApplicationErrorAuditFallbackWriter =
      defaultFallbackWriter,
): Promise<boolean> {
  const record =
    buildApplicationErrorAuditRecord(
      event,
    )

  try {
    await insertApplicationErrorAuditRecord(
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