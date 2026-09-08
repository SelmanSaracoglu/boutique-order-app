import { randomUUID } from 'node:crypto'
import type { RequestHandler } from 'express'
import { sanitizeLogText } from '../logging/structuredLogger.js'

const MAX_SOURCE_IP_LENGTH = 64
const MAX_USER_AGENT_LENGTH = 256

export interface RequestContext {
  requestId: string
  startedAt: bigint
  sourceIp: string
  userAgent: string | null
}

declare module 'express-serve-static-core' {
  interface Request {
    requestContext: RequestContext
  }
}

function readSourceIp(
  remoteAddress: string | undefined,
): string {
  if (!remoteAddress) {
    return 'unknown'
  }

  return (
    sanitizeLogText(
      remoteAddress,
      MAX_SOURCE_IP_LENGTH,
    ) || 'unknown'
  )
}

function readUserAgent(
  userAgent: string | undefined,
): string | null {
  if (!userAgent) {
    return null
  }

  return (
    sanitizeLogText(
      userAgent,
      MAX_USER_AGENT_LENGTH,
    ) || null
  )
}

export const requestContextMiddleware: RequestHandler = (
  request,
  response,
  next,
) => {
  const requestId = randomUUID()

  request.requestContext = {
    requestId,
    startedAt: process.hrtime.bigint(),
    sourceIp: readSourceIp(
      request.socket.remoteAddress,
    ),
    userAgent: readUserAgent(
      request.get('user-agent'),
    ),
  }

  response.setHeader('X-Request-ID', requestId)

  next()
}