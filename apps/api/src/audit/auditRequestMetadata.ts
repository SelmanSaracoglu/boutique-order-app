import type { Request } from 'express'
import type {
  AuditOperation,
  RequestAuditMetadata,
} from './requestAuditEvent.js'

type RequestAuditDetails = {
  operation: AuditOperation
  route: string
  status: number
}

export function resolveRequestAuditRoute(
  request: Request,
): string {
  const routePath = request.route?.path

  if (typeof routePath === 'string') {
    return `${request.baseUrl}${routePath}`
  }

  return request.baseUrl || 'UNMATCHED'
}

export function buildRequestAuditMetadata(
  request: Request,
  details: RequestAuditDetails,
): RequestAuditMetadata {
  return {
    requestId:
      request.requestContext.requestId,
    operation: details.operation,
    method: request.method,
    route: details.route,
    status: details.status,
    sourceIp:
      request.requestContext.sourceIp,
    userAgent:
      request.requestContext.userAgent,
  }
}