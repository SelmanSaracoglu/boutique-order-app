import { timingSafeEqual } from 'node:crypto'
import type {
  RequestHandler,
} from 'express'
import {
  buildRequestAuditMetadata,
  resolveRequestAuditRoute,
} from '../audit/auditRequestMetadata.js'
import {
  tryRecordSecurityAuditEvent,
} from '../audit/requestAuditRepository.js'

export const CSRF_HEADER_NAME =
  'x-csrf-token'

const invalidCsrfTokenResponse = {
  error: {
    code: 'INVALID_CSRF_TOKEN',
    message: 'Invalid CSRF token.',
  },
}

function csrfTokensMatch(
  sessionToken: string,
  requestToken: string,
): boolean {
  const sessionTokenBuffer =
    Buffer.from(sessionToken)

  const requestTokenBuffer =
    Buffer.from(requestToken)

  if (
    sessionTokenBuffer.length !==
    requestTokenBuffer.length
  ) {
    return false
  }

  return timingSafeEqual(
    sessionTokenBuffer,
    requestTokenBuffer,
  )
}

export const requireCsrf: RequestHandler =
  async (
    request,
    response,
    next,
  ) => {
    const sessionToken =
      request.session.csrfToken

    const requestToken =
      request.get(CSRF_HEADER_NAME)

    if (
      typeof sessionToken !== 'string' ||
      typeof requestToken !== 'string' ||
      !csrfTokensMatch(
        sessionToken,
        requestToken,
      )
    ) {
      const auditRoute =
        resolveRequestAuditRoute(request)

      const authenticatedUser =
        request.authenticatedUser

      await tryRecordSecurityAuditEvent({
        action:
          'CSRF_VALIDATION_FAILED',
        reasonCode:
          'INVALID_CSRF_TOKEN',
        actor: authenticatedUser
          ? {
              type: 'USER',
              user: authenticatedUser,
            }
          : {
              type: 'ANONYMOUS',
            },
        target: {
          resourceType: 'REQUEST',
          resourceId: auditRoute,
        },
        request:
          buildRequestAuditMetadata(
            request,
            {
              operation:
                'VALIDATE_CSRF',
              route: auditRoute,
              status: 403,
            },
          ),
      })

      response
        .status(403)
        .json(
          invalidCsrfTokenResponse,
        )

      return
    }

    next()
  }