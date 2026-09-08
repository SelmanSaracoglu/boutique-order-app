import type {
  Request,
  RequestHandler,
} from 'express'
import {
  sanitizeLogText,
  writeStructuredLog,
} from './structuredLogger.js'

const ACCESS_LOG_SCHEMA_VERSION = 1
const SERVICE_NAME = 'boutique-order-api'

const MAX_ENVIRONMENT_LENGTH = 32
const MAX_HTTP_METHOD_LENGTH = 16
const MAX_ROUTE_LENGTH = 256
const MAX_USERNAME_LENGTH = 64

export type AccessLogRecord = {
  timestamp: string
  requestId: string
  eventType: 'HTTP_ACCESS'
  service: typeof SERVICE_NAME
  environment: string
  schemaVersion: typeof ACCESS_LOG_SCHEMA_VERSION
  method: string
  route: string
  status: number
  durationMs: number
  sourceIp: string
  userAgent: string | null
  actor?: {
    userId: number
    username: string
    role: string
  }
}

export type AccessLogWriter = (
  record: AccessLogRecord,
) => void

function readEnvironment(): string {
  return (
    sanitizeLogText(
      process.env.NODE_ENV ?? 'development',
      MAX_ENVIRONMENT_LENGTH,
    ) || 'development'
  )
}

function resolveRouteTemplate(
  request: Request,
): string {
  const routePath: unknown = request.route?.path

  if (typeof routePath !== 'string') {
    return 'UNMATCHED'
  }

  const requestPath =
    request.originalUrl.split('?')[0] ?? ''

  const requestSegments = requestPath
    .split('/')
    .filter(Boolean)

  const routeSegments = routePath
    .split('/')
    .filter(Boolean)

  const mountSegmentCount = Math.max(
    0,
    requestSegments.length - routeSegments.length,
  )

  const routeTemplateSegments = [
    ...requestSegments.slice(0, mountSegmentCount),
    ...routeSegments,
  ]

  const routeTemplate =
    routeTemplateSegments.length > 0
      ? `/${routeTemplateSegments.join('/')}`
      : '/'

  return (
    sanitizeLogText(
      routeTemplate,
      MAX_ROUTE_LENGTH,
    ) || 'UNMATCHED'
  )
}

function buildAccessLogRecord(
  request: Request,
  status: number,
): AccessLogRecord {
  const durationNanoseconds =
    process.hrtime.bigint() -
    request.requestContext.startedAt

  const durationMilliseconds =
    Number(durationNanoseconds) / 1_000_000

  const actor = request.authenticatedUser

  return {
    timestamp: new Date().toISOString(),
    requestId: request.requestContext.requestId,
    eventType: 'HTTP_ACCESS',
    service: SERVICE_NAME,
    environment: readEnvironment(),
    schemaVersion: ACCESS_LOG_SCHEMA_VERSION,
    method:
      sanitizeLogText(
        request.method,
        MAX_HTTP_METHOD_LENGTH,
      ) || 'UNKNOWN',
    route: resolveRouteTemplate(request),
    status,
    durationMs: Number(
      durationMilliseconds.toFixed(3),
    ),
    sourceIp: request.requestContext.sourceIp,
    userAgent: request.requestContext.userAgent,
    ...(actor
      ? {
          actor: {
            userId: actor.id,
            username: sanitizeLogText(
              actor.username,
              MAX_USERNAME_LENGTH,
            ),
            role: actor.role,
          },
        }
      : {}),
  }
}

const defaultAccessLogWriter: AccessLogWriter = (
  record,
) => {
  if (process.env.NODE_ENV === 'test') {
    return
  }

  writeStructuredLog('stdout', record)
}

export function createAccessLoggerMiddleware(
  writeAccessLog: AccessLogWriter =
    defaultAccessLogWriter,
): RequestHandler {
  return (request, response, next) => {
    let accessLogWritten = false

    const writeCompletedRequest = (): void => {
      if (accessLogWritten) {
        return
      }

      accessLogWritten = true

      writeAccessLog(
        buildAccessLogRecord(
          request,
          response.statusCode,
        ),
      )
    }

    response.once(
      'finish',
      writeCompletedRequest,
    )

    response.once(
      'close',
      writeCompletedRequest,
    )

    next()
  }
}

export const accessLoggerMiddleware =
  createAccessLoggerMiddleware()