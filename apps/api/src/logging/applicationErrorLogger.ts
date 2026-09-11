import { isIP } from 'node:net'
import {
  APPLICATION_ERROR_ACTION,
  type ApplicationErrorEventInput,
} from '../audit/applicationErrorEvent.js'
import {
  sanitizeLogText,
  type StructuredLogRecord,
  writeStructuredLog,
} from './structuredLogger.js'

const LOG_SCHEMA_VERSION = 1
const SERVICE_NAME =
  'boutique-order-api'

const MAX_ENVIRONMENT_LENGTH = 32
const MAX_USERNAME_LENGTH = 64
const MAX_TARGET_ID_LENGTH = 256
const MAX_METHOD_LENGTH = 16
const MAX_ROUTE_LENGTH = 256
const MAX_USER_AGENT_LENGTH = 256
const MAX_ERROR_NAME_LENGTH = 64
const MAX_STACK_SOURCE_LENGTH = 16_384
const MAX_STACK_FRAME_LENGTH = 512
const MAX_STACK_FRAMES = 20

const SAFE_ERROR_NAME_PATTERN =
  /^[A-Za-z][A-Za-z0-9_.-]*$/

export type ApplicationErrorLogWriter =
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

function readErrorName(
  error: unknown,
): string {
  if (!(error instanceof Error)) {
    return 'UnknownError'
  }

  try {
    const sanitizedName =
      sanitizeLogText(
        error.name,
        MAX_ERROR_NAME_LENGTH,
      )

    return SAFE_ERROR_NAME_PATTERN.test(
      sanitizedName,
    )
      ? sanitizedName
      : 'UnknownError'
  } catch {
    return 'UnknownError'
  }
}

function readSafeStackFrames(
  error: unknown,
): string[] {
  if (!(error instanceof Error)) {
    return []
  }

  let stack: string | undefined

  try {
    stack = error.stack
  } catch {
    return []
  }

  if (typeof stack !== 'string') {
    return []
  }

  return stack
    .slice(0, MAX_STACK_SOURCE_LENGTH)
    .split(/\r?\n/)
    .slice(1)
    .map((frame) =>
      sanitizeLogText(
        frame,
        MAX_STACK_FRAME_LENGTH,
      ),
    )
    .filter((frame) =>
      frame.startsWith('at '),
    )
    .slice(0, MAX_STACK_FRAMES)
}

function buildActorLog(
  actor:
    ApplicationErrorEventInput['actor'],
): StructuredLogRecord {
  if (actor.type !== 'USER') {
    return {
      type: actor.type,
    }
  }

  return {
    type: 'USER',
    userId: actor.user.id,
    username:
      sanitizeRequiredText(
        actor.user.username,
        MAX_USERNAME_LENGTH,
        'unknown',
      ),
    role: actor.user.role,
  }
}

function buildApplicationErrorLogRecord(
  event: ApplicationErrorEventInput,
  error: unknown,
): StructuredLogRecord {
  return {
    timestamp: new Date().toISOString(),
    requestId: event.request.requestId,
    eventType:
      APPLICATION_ERROR_ACTION,
    service: SERVICE_NAME,
    environment: readEnvironment(),
    schemaVersion:
      LOG_SCHEMA_VERSION,
    severity: 'ERROR',
    operation:
      event.request.operation,
    method:
      sanitizeRequiredText(
        event.request.method,
        MAX_METHOD_LENGTH,
        'UNKNOWN',
      ),
    route:
      sanitizeRequiredText(
        event.request.route,
        MAX_ROUTE_LENGTH,
        'UNMATCHED',
      ),
    status: event.request.status,
    errorCode: event.errorCode,
    actor:
      buildActorLog(event.actor),
    target: {
      resourceType:
        event.target.resourceType,
      resourceId:
        sanitizeRequiredText(
          event.target.resourceId,
          MAX_TARGET_ID_LENGTH,
          'unknown',
        ),
    },
    sourceIp:
      isIP(event.request.sourceIp) > 0
        ? event.request.sourceIp
        : 'unknown',
    userAgent:
      event.request.userAgent === null
        ? null
        : (
            sanitizeLogText(
              event.request.userAgent,
              MAX_USER_AGENT_LENGTH,
            ) || null
          ),
    technical: {
      errorName:
        readErrorName(error),
      stackFrames:
        readSafeStackFrames(error),
    },
  }
}

const defaultLogWriter:
  ApplicationErrorLogWriter =
  (record) => {
    writeStructuredLog(
      'stderr',
      record,
    )
  }

export function tryWriteApplicationErrorLog(
  event: ApplicationErrorEventInput,
  error: unknown,
  writeLog:
    ApplicationErrorLogWriter =
      defaultLogWriter,
): boolean {
  const record =
    buildApplicationErrorLogRecord(
      event,
      error,
    )

  try {
    writeLog(record)
    return true
  } catch {
    return false
  }
}