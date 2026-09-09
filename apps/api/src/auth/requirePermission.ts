import type {
  Request,
  RequestHandler,
} from 'express'
import {
  buildRequestAuditMetadata,
  resolveRequestAuditRoute,
} from '../audit/auditRequestMetadata.js'
import type {
  RequestAuditTarget,
} from '../audit/requestAuditEvent.js'
import {
  tryRecordSecurityAuditEvent,
} from '../audit/requestAuditRepository.js'
import {
  hasPermission,
  type Permission,
} from './permissions.js'

const authenticationRequiredResponse = {
  error: {
    code: 'AUTHENTICATION_REQUIRED',
    message: 'Authentication required.',
  },
}

const forbiddenResponse = {
  error: {
    code: 'FORBIDDEN',
    message:
      'You do not have permission to perform this action.',
  },
}

function resolveAuthorizationAuditTarget(
  request: Request,
  auditRoute: string,
): RequestAuditTarget {
  const orderId = request.params.orderId

  if (
    typeof orderId === 'string' &&
    orderId.length > 0
  ) {
    return {
      resourceType: 'ORDER',
      resourceId: orderId,
    }
  }

  return {
    resourceType: 'REQUEST',
    resourceId: auditRoute,
  }
}

export function requirePermission(
  permission: Permission,
): RequestHandler {
  return async (
    request,
    response,
    next,
  ) => {
    const authenticatedUser =
      request.authenticatedUser

    if (!authenticatedUser) {
      response
        .status(401)
        .json(authenticationRequiredResponse)

      return
    }

    if (
      !hasPermission(
        authenticatedUser.role,
        permission,
      )
    ) {
      const auditRoute =
        resolveRequestAuditRoute(request)

      await tryRecordSecurityAuditEvent({
        action: 'AUTHORIZATION_DENIED',
        reasonCode: 'FORBIDDEN',
        permission,
        actor: {
          type: 'USER',
          user: authenticatedUser,
        },
        target:
          resolveAuthorizationAuditTarget(
            request,
            auditRoute,
          ),
        request: buildRequestAuditMetadata(
          request,
          {
            operation:
              'AUTHORIZE_REQUEST',
            route: auditRoute,
            status: 403,
          },
        ),
      })

      response
        .status(403)
        .json(forbiddenResponse)

      return
    }

    next()
  }
}