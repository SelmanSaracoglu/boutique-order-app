import type { Request } from 'express'
import {
  buildRequestAuditMetadata,
  resolveRequestAuditRoute,
} from './auditRequestMetadata.js'
import type {
  AuditOperation,
  RequestAuditTarget,
  RequestValidationReasonCode,
} from './requestAuditEvent.js'
import {
  tryRecordSecurityAuditEvent,
} from './requestAuditRepository.js'

type RequestValidationAuditDetails = {
  operation: AuditOperation
  reasonCode:
    RequestValidationReasonCode
  target?: RequestAuditTarget
}

function resolveValidationAuditRoute(
  request: Request,
): string {
  const auditRoute =
    resolveRequestAuditRoute(request)

  if (auditRoute !== 'UNMATCHED') {
    return auditRoute
  }

  return request.path || 'UNMATCHED'
}

export async function recordRequestValidationFailure(
  request: Request,
  details: RequestValidationAuditDetails,
): Promise<void> {
  const auditRoute =
    resolveValidationAuditRoute(request)

  const authenticatedUser =
    request.authenticatedUser

  await tryRecordSecurityAuditEvent({
    action:
      'REQUEST_VALIDATION_FAILED',
    reasonCode: details.reasonCode,
    actor: authenticatedUser
      ? {
          type: 'USER',
          user: authenticatedUser,
        }
      : {
          type: 'ANONYMOUS',
        },
    target:
      details.target ?? {
        resourceType: 'REQUEST',
        resourceId: auditRoute,
      },
    request: buildRequestAuditMetadata(
      request,
      {
        operation: details.operation,
        route: auditRoute,
        status: 400,
      },
    ),
  })
}